const fs = require("fs");
const d3 = require("d3");
const piano = d3.csvParse(fs.readFileSync("./piano.csv", "utf8"));

/* range options
	midi: 'exact' or 'between' or []
	duration: 'exact', 
*/

const midiFull = piano.map(d => +d.midi);
const durationFull = [1, 2, 3, 4, 5];
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
      { midi: 63, duration: 1 }
    ]
  }
];
