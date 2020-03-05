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

// const iterations = 6000; // 10 per second
const RECENT = 1000;
const PER = 10000;
const MIN = 10;
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
  console.time("generate");
  const answer = sequence.map(d => `${d.midi}-${d.duration}.`).join("");
  const { midis, durations } = range;
  midis.sort(d3.ascending);
  durations.sort(d3.ascending);
  const mL = midis.length;
  const dL = durations.length;

  const makeAttempt = () => {
    const out = sequence.map(() => {
      const mR = midis[Math.floor(generator.random() * mL)];
      const dR = durations[Math.floor(generator.random() * dL)];
      return [mR, dR];
    });
    const a = out.map(d => `${d[0]}-${d[1]}.`).join("");
    const dist = levDist(answer, a);
    // TODO calculate best (lev dist vs exact order)
    // rest will need to be 00 not 0
    out[0].push(dist);
    return out;
  };

  const output = d3.range(ITERATIONS).map(makeAttempt);
  console.timeEnd("generate");
  return output;
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
        best: { lev: 999, seq: null },
        done: false
      };
      current = unifiedData.levels[0];
    }

    const recent = generateAttempts(current);
    const index = recent.findIndex(d => d[0][2] === 0);
    const done = index > -1;
    const { result } = current;
    const sliced = done ? recent.slice(0, index + 1) : recent;
    result.recent = sliced.slice(-RECENT);
    result.done = done;
    result.attempts += done ? index + 1 : ITERATIONS;
    const dupe = recent.map(d => ({ lev: d[0][2], seq: d }));
    dupe.sort((a, b) => d3.ascending(a.lev, b.lev));
    result.best = dupe[0].lev < result.best.lev ? dupe[0] : result.best;

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
    // if (DEV) fs.writeFileSync("test-prev.json", JSON.stringify(prevData));
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
