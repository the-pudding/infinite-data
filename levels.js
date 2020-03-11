const fs = require("fs");
const request = require("request");
const d3 = require("d3");

const piano = d3.csvParse(fs.readFileSync("./piano.csv", "utf8"));
// const midiFull = piano.map(d => +d.midi).slice(24, 85); // 61 key
const midiFull = piano.map(d => +d.midi).slice(24, 73); // 49 key
const durationFull = [0, 1, 2, 3, 4];

/* range options
	midi: 'exact' or 'between' or 'full'
	duration: 'exact',
*/

function parseMidi({ value, sequence }) {
  const midis = sequence.map(d => d.midi);
  if (value === "exact") return [...new Set(midis)];
  else if (value === "between") {
    const [s, e] = d3.extent(midis);
    return d3.range(s, e + 1).map(d => d);
  } else if (value === "full") {
    return midiFull;
  }
  // default to exact
  return [...new Set(midis)];
}

function parseDuration({ value, sequence }) {
  const durations = sequence.map(d => d.duration);
  if (value === "exact") return [...new Set(durations)];
  else if (value === "between") {
    const [s, e] = d3.extent(durations);
    return d3.range(s, e + 1).map(d => d);
  } else if (value === "full") {
    return durationFull;
  }
  // default to exact
  return [...new Set(midis)];
}

function parseSequence(str) {
  const notes = str.split(".");
  return notes.map(d => {
    const [midi, duration] = d.split("-").map(d => +d);
    return { midi, duration };
  });
}

function cleanData(data) {
  return data
    .filter(d => d.sequence)
    .map(d => {
      const sequence = parseSequence(d.sequence);
      return {
        title: d.title,
        odds: +d.odds,
        apm: +d.apm,
        est: +d.est,
        sequence,
        range: {
          midis: parseMidi({ value: d.range_midi, sequence }),
          durations: parseDuration({ value: d.range_duration, sequence })
        }
      };
    });
}

function getSheet() {
  const id = "1KOLaqf34-8e0S1VsMzIa6IafaTiCc0UE46UK6Owex7o";
  const gid = 0;
  const base = "https://docs.google.com/spreadsheets/u/1/d";
  const url = `${base}/${id}/export?format=csv&id=${id}&gid=${gid}`;

  return new Promise((resolve, reject) => {
    request(url, (error, response, body) => {
      if (error) reject(error);
      else if (response && response.statusCode === 200) {
        try {
          const data = d3.csvParse(body);
          const levels = cleanData(data);
          const backup = { levels };
          fs.writeFileSync("./levels-backup.json", JSON.stringify(backup));
          resolve(levels);
        } catch (err) {
          reject(err);
        }
      } else reject(response.statusCode);
    });
  });
}

async function init() {
  try {
    const data = await getSheet();
    return Promise.resolve(data);
  } catch (err) {
    return Promise.reject(err);
  }
}

module.exports = init;

/*

module.exports = [
  {
    id: 0,
    title: "Beethoven's 5th",
    range: {
      midi: "exact",
      duration: "exact"
    },
    sequence: [
      { midi: 67, duration: 3 },
      { midi: 67, duration: 3 },
      { midi: 67, duration: 3 },
      { midi: 63, duration: 3 }
    ]
  },
  {
    id: 1,
    title: "Beethoven's 5th #2",
    sequence: [
      { midi: 67, duration: 3 },
      { midi: 67, duration: 3 },
      { midi: 67, duration: 3 },
      { midi: 63, duration: 0 }
    ]
  },
  {
    id: 2,
    title: "Ice Ice Baby",
    range: {
      midi: "exact",
      duration: "exact"
    },
    sequence: [
      { midi: 50, duration: 3 },
      { midi: 50, duration: 3 },
      { midi: 50, duration: 3 },
      { midi: 50, duration: 4 },
      { midi: 50, duration: 4 },
      { midi: 50, duration: 3 },
      { midi: 45, duration: 3 }
    ]
  }
];
*/
