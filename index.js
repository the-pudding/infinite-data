const DEV = true;
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
const fde = require("fast-deep-equal");
const notify = require("./notify.js");
const getLevels = require("./levels.js");
// const levDist = require("levdist");
// const MersenneTwister = require("mersenne-twister");
// const generator = new MersenneTwister();

const RECENT = 1000;
const MAX_PER = 20000000;
const MIN = 10;

const path = "2020/04/infinite-data";
const file = "data.json";
const updated = new Date().toString();
const version = Date.now();

const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const bucket = process.env.AWS_BUCKET;
const region = process.env.AWS_REGION;

function generateAttempts({ range, sequence, iterations }) {
  const seqLen = sequence.length;
  const { midis, durations } = range;
  midis.sort(d3.ascending);
  durations.sort(d3.ascending);
  const mL = midis.length;
  const dL = durations.length;

  let done = false;

  // this is where the magic happens (ie optimization needed)
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
    done = fde(seq, sequence);
    return seq;
  };

  const output = [];
  let i = 0;

  const start = Date.now();

  if (DEV) console.time("makeAttempt");

  iterations = 100000000;
  const mod = iterations / 10;
  while (i < iterations) {
    if (i % mod === 0) console.log(i / iterations);
    output[i % RECENT] = makeAttempt();
    if (done) break;
    i += 1;
  }

  if (DEV) console.timeEnd("makeAttempt");

  const n = (Date.now() - start) / 1000;
  const g = n < 1 ? "< 0" : Math.floor(n);
  console.log("generate ......", `${g}s`);

  const recent = output.filter(d => d);
  if (done) {
    const t = recent.splice(correct, 1);
    recent.push(t);
  }
  return { recent, done, attempts: i };
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

function joinData({ levels, prevData }) {
  try {
    // adds new levels to the live data if not aligned
    const unifiedData = unify({ levels, prevData });

    // grab the active level and update it
    let current = unifiedData.levels.find(d => d.result && !d.result.done);

    // TODO remove
    unifiedData.levels.reverse();

    if (!current) {
      current = unifiedData.levels.slice(0).find(d => !d.result);
      current.result = {
        attempts: 0,
        recent: [],
        done: false
      };
    }

    const sig = Math.max(0, current.sig - 3);
    const perMin = Math.min(MAX_PER, Math.pow(10, sig));
    const iterations = MIN * perMin;
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
    if (result.done) result.end = new Date().toString();

    console.log("attempts ......", result.attempts);

    return {
      ...unifiedData,
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
    // notify(msg);
  }
}

init();
