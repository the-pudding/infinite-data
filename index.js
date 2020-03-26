const DEV = process.env.NODE_ENV === "development";

if (DEV)
  console.log(`
******         ******
****** TESTING ******
******         ******
`);

const fs = require("fs");
const request = require("request");
const dataS3 = require("data-s3");
const d3 = require("d3");
const fastDeepEqual = require("fast-deep-equal");
const notify = require("./notify.js");
const getLevels = require("./levels.js");

const RECENT = 1000;
const MIN = 10;

const path = "2020/04/infinite-data";
const file = "data.json";
const updated = new Date().toUTCString();
const version = Date.now();

const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const bucket = process.env.AWS_BUCKET;
const region = process.env.AWS_REGION;

function generateAttempts({ range, sequence, iterations, recent }) {
  const seqLen = sequence.length;
  const seqAnswer = sequence.map(d => [d.midi, d.duration]);
  const { midis, durations } = range;
  midis.sort(d3.ascending);
  durations.sort(d3.ascending);
  const mL = midis.length;
  const dL = durations.length;

  let done = false;

  // this is where the magic happens
  const makeAttempt = () => {
    const seq = [];
    let s = 0;
    while (s < seqLen) {
      seq.push([
        midis[~~(Math.random() * mL)],
        durations[~~(Math.random() * dL)]
      ]);
      s += 1;
    }
    done = fastDeepEqual(seq, seqAnswer);
    return seq;
  };

  let i = 0;

  const start = Date.now();
  const output = recent.map(d => d);

  while (i < iterations) {
    output[i % RECENT] = makeAttempt();
    if (done) break;
    i += 1;
  }

  const n = (Date.now() - start) / 1000;
  const g = n < 1 ? "< 0" : Math.floor(n);
  console.log("generate ......", `${g}s`);

  const recentNew = output.filter(d => d);
  if (done) {
    const [t] = recentNew.splice(i, 1);
    recentNew.push(t);
    i += 1;
  }
  return { done, attempts: i, recent: recentNew };
}

function getData() {
  return new Promise((resolve, reject) => {
    if (DEV) {
      const data = JSON.parse(fs.readFileSync("./levels-backup.json", "utf8"));
      resolve(data);
    } else {
      const url = `https://pudding.cool/${path}/${file}?version=${version}`;
      request(url, (err, response, body) => {
        if (err) reject(err);
        else if (response && response.statusCode === 200) {
          const data = JSON.parse(body);
          resolve(data);
        }
        reject(response.statusCode);
      });
    }
  });
}

function unify({ levels, prevData }) {
  const add = levels.filter(
    l => !prevData.levels.find(p => p.title === l.title)
  );
  prevData.levels = prevData.levels.concat(add);
  return prevData;
}

function toTime(hours) {
  const f = d3.format(",");
  const r = Math.round(hours);
  const d = Math.round(r / 24);
  const y = Math.round(d / 365);
  const c = Math.round(y / 100);
  if (hours < 24) return `${r} hours`;
  if (d < 365) return `${d} day${d > 1 ? "s" : ""}`;
  if (y < 200) return `${y} year${y > 1 ? "s" : ""}`;
  return `${f(c)} centuries`;
}

function addEstimate(data) {
  const index = data.findIndex(d => d.result && !d.result.done);
  const cur = data[index];
  const actual = cur.result.attempts / cur.apm / 60;
  const estimated = cur.est;
  const diff = estimated - actual;
  const base = diff < 0 ? 0 : diff;

  let tally = base;
  return data.map((d, i) => {
    let estimate;
    if (i === index) {
      estimate = base === 0 ? "Anytime now..." : toTime(base);
    } else if (i > index) {
      tally += d.est;
      estimate = toTime(tally);
    }

    return {
      ...d,
      estimate
    };
  });
}

function joinData({ levels, prevData }) {
  try {
    // adds new levels to the live data if not aligned
    const unifiedData = unify({ levels, prevData });
    unifiedData.levels.sort((a, b) => d3.ascending(a.odds, b.odds));

    // grab the active level and update it
    let current = unifiedData.levels.find(d => d.result && !d.result.done);

    if (!current) {
      const index = unifiedData.levels.findIndex(d => !d.result);
      const current = unifiedData.levels[index];
      current.result = {
        attempts: 0,
        recent: [],
        done: false,
        start: new Date().toUTCString(),
        end: ""
      };
      // just keep last 10 previous ones
      if (index > 0) {
        const r = unifiedData.levels[index - 1].result.recent;
        r = r.slice(-10);
      }
    }

    const iterations = MIN * current.apm;
    console.log("title .........", current.title);
    console.log("iterations ....", iterations);

    const { recent, done, attempts } = generateAttempts({
      ...current,
      iterations
    });
    const { result } = current;

    result.done = done;
    result.recent = recent;
    result.attempts += attempts;
    if (result.done) result.end = new Date().toUTCString();

    console.log("attempts ......", result.attempts);

    const withEstimate = addEstimate(unifiedData.levels);

    return {
      ...unifiedData,
      levels: withEstimate,
      updated
    };
  } catch (err) {
    throw new Error(err);
  }
}

async function init() {
  try {
    dataS3.init({ accessKeyId, secretAccessKey, region });
    const levels = await getLevels();
    const prevData = await getData();
    const data = await joinData({ levels, prevData });
    if (DEV) fs.writeFileSync("test.json", JSON.stringify(data));
    else await dataS3.upload({ bucket, path, file, data });
    process.exit();
  } catch (err) {
    const msg = err.toString();
    if (DEV) console.log(msg);
    else notify(msg);
  }
}

init();
