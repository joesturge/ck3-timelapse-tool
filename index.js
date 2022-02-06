const fs = require("fs");
const { execFile } = require("child_process");
const path = require("path");
const csv = require("csvtojson");
const { PNG } = require("pngjs");
const JSONStream = require("JSONStream");
const es = require("event-stream");
const { Transform } = require("readable-stream");

class RemoveControlChars extends Transform {
  _transform = (chunk, enc, cb) => {
    var upperChunk = chunk
      .toString()
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
    this.push(upperChunk);
    cb();
  };
}

// /landed_titles/landed_titles
// /dead_unprunable

const CK3_JSON_EXE = "./ck3json.exe";
const TITLE_DEF_FILE = "game/common/landed_titles/00_landed_titles.txt";
const MAP_DATA_PATH = "game/map_data";
const PROVINCE_PNG_FILE = "provinces.png";
const PROVINCE_DEF_FILE = "definition.csv";

const [saveFilepath, installRootFilepath] = process.argv.slice(2);

const saveFileStream = execFile(CK3_JSON_EXE, [
  path.join(saveFilepath),
]).stdout.pipe(new RemoveControlChars());

saveFileStream.pipe(JSONStream.parse(["dead_unprunable", { emitKey: true }])).pipe(
  es.mapSync((data) => {
    console.log(data);
  })
);
