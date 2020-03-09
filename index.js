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
const levDist = require("levdist");
const MersenneTwister = require("mersenne-twister");
const generator = new MersenneTwister();
const notify = require("./notify.js");
const devData = JSON.parse(fs.readFileSync("./levels-backup2.json", "utf8"));
const getLevels = require("./levels.js");

const RECENT = 1000;
const PER = 10000000; // x per minute
const MIN = 10;
const ITERATIONS = MIN * PER;
const path = "2020/04/infinite-data";
const file = "data.json";
const updated = new Date().toString();
const version = Date.now();

const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const bucket = process.env.AWS_BUCKET;
const region = process.env.AWS_REGION;

function generateAttempts({ range, sequence }) {
  const answer = sequence.map(d => `${d.midi}-${d.duration}.`).join("");
  const { midis, durations } = range;
  midis.sort(d3.ascending);
  durations.sort(d3.ascending);
  const mL = midis.length;
  const dL = durations.length;

  let done = false;
  let correct = null;

  const makeAttempt = i => {
    const out = sequence.map(() => {
      const mR = midis[Math.floor(generator.random() * mL)];
      const dR = durations[Math.floor(generator.random() * dL)];
      return [mR, dR];
    });
    const a = out.map(d => `${d[0]}-${d[1]}.`).join("");
    if (a === answer) done = true;
    return out;
  };

  // optimized atempts
  console.time("generate");
  const output = [];
  let i = 0;
  while (i < ITERATIONS) {
    output[i % RECENT] = makeAttempt(i);
    if (done) {
      correct = i;
      break;
    }
    i += 1;
    // recent.push(makeAttempt(i));
  }
  console.timeEnd("generate");

  const recent = output.filter(d => d);
  if (done) {
    const t = recent.splice(correct, 1);
    recent.push(t);
  }
  return { recent, done, attempts: i };
}

function getData() {
  return new Promise((resolve, reject) => {
    if (DEV) resolve(devData);
    else {
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
    if (!current) {
      unifiedData.levels[0].result = {
        attempts: 0,
        recent: [],
        done: false
      };
      current = unifiedData.levels[0];
    }

    const { recent, done, attempts } = generateAttempts(current);
    const { result } = current;

    result.done = done;
    result.recent = recent;
    result.attempts += attempts;

    if (DEV) console.log("attempts", result.attempts);

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
    notify(msg);
  }
}

init();
