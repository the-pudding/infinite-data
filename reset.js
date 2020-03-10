const fs = require("fs");
const dataS3 = require("data-s3");
require("dotenv").config();

const data = JSON.parse(fs.readFileSync("./levels-backup.json", "utf8"));
const path = "2020/04/infinite-data";
const file = "data.json";
const now = new Date().toString();
data.start = now;
data.updated = now;

const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const bucket = process.env.AWS_BUCKET;
const region = process.env.AWS_REGION;

async function init() {
  try {
    dataS3.init({ accessKeyId, secretAccessKey, region });

    await dataS3.upload({ bucket, path, file, data });
    console.log("reset upload successful!");
  } catch (err) {
    console.log(err);
  }
}

init();
