const fs = require("fs");
const { execFile } = require("child_process");
const path = require("path");
const csv = require("csvtojson");
const { PNG } = require("pngjs");
const JSONStream = require("JSONStream");
const es = require("event-stream");
const { Transform } = require("readable-stream");
const moment = require("moment");
const CombinedStream = require("combined-stream");

// /landed_titles/landed_titles
// /dead_unprunable

const parseDate = (str) => {
  return moment(str, "yyyy.MM.dd").utc().toDate();
};

const CK3_JSON_EXE = "./ck3json.exe";
const TITLE_DEF_FILE = "game/common/landed_titles/00_landed_titles.txt";
const MAP_DATA_PATH = "game/map_data";
const PROVINCE_PNG_FILE = "provinces.png";
const PROVINCE_DEF_FILE = "definition.csv";

const [saveFilepath, installRootFilepath] = process.argv.slice(2);

const outputStream = fs.createWriteStream("output.json");
const output2Stream = fs.createWriteStream("output2.json");

const saveFileStream = execFile(CK3_JSON_EXE, [
  path.join(saveFilepath),
]).stdout.pipe(
  es.mapSync((data) => {
    return data.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
  })
);

// Generate current title allegiance
const currentAllegiances = saveFileStream
  .pipe(JSONStream.parse(["landed_titles", "landed_titles", { emitKey: true }]))
  .pipe(
    es.mapSync((data) => {
      const liegeTitle = data?.value?.de_facto_liege;
      const title = data?.key;

      return {
        top: !(liegeTitle === 0 || liegeTitle),
        parent: liegeTitle,
        titles: [title],
      };
    })
  ).pipe(JSONStream.stringify()).pipe(outputStream);

// Generate past title allegiances
const pastAllegiances = saveFileStream
  .pipe(JSONStream.parse(["dead_unprunable", { emitKey: true }]))
  .pipe(
    es.mapSync((data) => {
      const date = parseDate(
        data?.value?.dead_data?.date
      )?.toLocaleDateString();
      const domain = data?.value?.dead_data?.domain;
      const liegeTitle = data?.value?.dead_data?.liege_title;

      if (date && domain && (liegeTitle || liegeTitle === 0)) {
        return {
          endDate: date,
          top: domain.includes(liegeTitle),
          parent: liegeTitle,
          titles: domain.filter((title) => title !== liegeTitle),
        };
      }
    })
  ).pipe(JSONStream.stringify()).pipe(output2Stream);
