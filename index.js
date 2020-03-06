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
const sgMail = require("@sendgrid/mail");
const devData = JSON.parse(fs.readFileSync("./levels-backup.json", "utf8"));
const getLevels = require("./levels.js");

const RECENT = 1000;
// const PER = 100000; // 100k per minute
// const SEC = 1;
const PER = 1000; // X per second
const SEC = 60;
const MIN = 10 * SEC;
const ITERATIONS = MIN * PER;
const path = "2020/04/infinite-data";
const file = "data.json";
const updated = new Date().toString();
const version = Date.now();

const sgKey = process.env.SENDGRID_API_KEY;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const bucket = process.env.AWS_BUCKET;
const region = process.env.AWS_REGION;

function sendMail(msg) {
  sgMail.setApiKey(sgKey);

  const msg = {
    to: "russell@polygraph.cool",
    from: "russellgoldenberg@gmail.com",
    subject: "Issue with Infinite Data",
    text: msg
  };

  sgMail
    .send(msg)
    .then(process.exit)
    .catch(err => {
      console.log(err);
      process.exit();
    });
}

function generateAttempts({ range, sequence }) {
  const answer = sequence.map(d => `${d.midi}-${d.duration}.`).join("");
  const { midis, durations } = range;
  midis.sort(d3.ascending);
  durations.sort(d3.ascending);
  const mL = midis.length;
  const dL = durations.length;

  const best = { index: 0, dist: 9999 };
  let done = false;

  const makeAttempt = i => {
    const out = sequence.map(() => {
      const mR = midis[Math.floor(generator.random() * mL)];
      const dR = durations[Math.floor(generator.random() * dL)];
      return [mR, dR];
    });
    if (!done) {
      const a = out.map(d => `${d[0]}-${d[1]}.`).join("");
      const dist = levDist(answer, a);
      if (dist < best.dist) {
        best.index = i;
        best.dist = dist;
        if (dist === 0) done = true;
      }
    }
    return out;
  };

  // optimized atempts
  console.time("generate");
  const recent = [];
  for (let i = 0; i < ITERATIONS; i++) {
    recent.push(makeAttempt(i));
  }
  console.timeEnd("generate");

  recent[best.index][0][2] = best.dist;

  // for (i = 0; i < ITERATIONS; i++) {}
  // recent[best.index][2] = best.dist;
  // console.timeEnd("best");

  return { recent, best };
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
        best: [],
        done: false
      };
      current = unifiedData.levels[0];
    }

    const { recent, best } = generateAttempts(current);
    const { result } = current;

    const done = best.dist === 0;
    const sliced = done ? recent.slice(0, best.index + 1) : recent;

    result.done = done;
    result.recent = sliced.slice(-RECENT);
    result.attempts += done ? best.index + 1 : ITERATIONS;
    if (result.best.length) {
      result.best =
        result.best.dist < result.best[0][2] ? recent[best.index] : result.best;
    } else result.best = recent[best.index];

    if (DEV) {
      console.log("attempts", result.attempts);
      console.log("best", JSON.stringify(result.best));
    }

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
  } catch (err) {
    const msg = err.toString();
    console.log(msg);
    // sendMail(msg);
  }
}

init();
