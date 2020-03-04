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
const devData = require("./dev.js");

// const iterations = 6000; // 10 per second
const RECENT = 1000;
const PER = 10000;
const MIN = 10;
const ITERATIONS = MIN * PER;
const levels = require("./levels.js");
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

function getRange({ range, sequence, v }) {
  if (range[v] === "exact") return [...new Set(sequence.map(d => d[v]))];
  else if (range[v] === "between") {
    const e = d3.extent(d => d[v]);
    return d3.range(e[0], e[1] + 1).map(d => d);
  }
  return range[v];
}

function generateAttempts({ range, sequence }) {
  console.time("generate");
  const answer = sequence.map(d => `${d.midi}-${d.duration}.`).join("");
  const midis = getRange({ range, sequence, v: "midi" });
  midis.sort(d3.ascending);
  const mL = midis.length;

  const durations = getRange({ range, sequence, v: "duration" });
  durations.sort(d3.ascending);
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

function unify(prev) {
  const add = levels.filter(l => !prev.levels.find(p => p.id === l.id));
  prev.levels = prev.levels.concat(add);
  return prev;
}

function joinData(prev) {
  // adds new levels to the live data if not aligned
  const unified = unify(prev);

  // grab the active level and update it
  let current = prev.levels.find(d => d.result && !d.result.done);
  if (!current) {
    // TODO
    // make the next one current
    // "result": {
    //     "attempts": 0,
    //     "recent": [],
    //     "best": { "lev": 999, "seq": null },
    //     "done": false
    //   }
  }
  if (current) {
    const recent = generateAttempts(current);
    const index = recent.findIndex(d => d[0][2] === 0);
    const done = index > -1;
    const { result } = current;
    const sliced = done ? recent.slice(0, index + 1) : recent;
    result.recent = sliced.slice(-RECENT);
    result.done = done;
    result.attempts += done ? index : ITERATIONS;
    const dupe = recent.map(d => ({ lev: d[0][2], seq: d }));
    dupe.sort((a, b) => d3.ascending(a.lev, b.lev));
    result.best = dupe[0].lev < result.best.lev ? dupe[0] : result.best;

    if (DEV) {
      console.log("attempts", result.attempts);
      console.log("best", JSON.stringify(result.best));
    }
    return {
      ...unified,
      updated
    };
  }
  throw new Error("no current level");
}

async function init() {
  try {
    dataS3.init({ accessKeyId, secretAccessKey, region });
    const prevData = await getData();
    const data = await joinData(prevData);
    if (DEV) fs.writeFileSync("test.json", JSON.stringify(data));
    else await dataS3.upload({ bucket, path, file, data });
  } catch (err) {
    console.log(err);
    // sendMail(err);
  }
}

init();

/* data schema
{
	updated: "Mon Mar 02 2020 17:29:02 GMT-0500 (Eastern Standard Time)" // date of last update
	levels: [{
		id: 0,
		title: "Beethoven's 5th",
		sequence: [
			{ midi: 67, duration: 8 },
			{ midi: 67, duration: 8 }
			{ midi: 67, duration: 8 }
			{ midi: 63, duration: 1 }
		]
		result: {
			attempts: 0,
			recent: [],
			done: false
		}
	}]
}
*/
