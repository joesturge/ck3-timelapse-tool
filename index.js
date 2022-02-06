const fs = require("fs");
const { execFile } = require("child_process");
const path = require("path");
const JSONStream = require("JSONStream");
const es = require("event-stream");
const moment = require("moment");
const mergeStream = require("merge-stream");
const getStream = require("get-stream");
const util = require("util");
const { Sequelize, Model, DataTypes } = require("sequelize");
var chunker = require("stream-chunker");

const parseDate = (str) => {
  return moment(str, "yyyy.MM.dd").utc().toDate();
};

const CK3_JSON_EXE = "./ck3json.exe";
const TITLE_DEF_FILE = "game/common/landed_titles/00_landed_titles.txt";
const MAP_DATA_PATH = "game/map_data";
const PROVINCE_PNG_FILE = "provinces.png";
const PROVINCE_DEF_FILE = "definition.csv";

const [saveFilepath, installRootFilepath] = process.argv.slice(2);

const childProcess = execFile(CK3_JSON_EXE, [path.join(saveFilepath)]);
childProcess.on("exit", () => {
  childProcess.stdout.emit("end");
});
const saveFileStream = childProcess.stdout
  .pipe(
    chunker(10000, {
      flush: true,
      encoding: "utf8",
    })
  )
  .pipe(
    es.map((data, callback) => {
      callback(null, data.replace(/[\u0000-\u001F\u007F-\u009F]/g, ""));
    })
  );

const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: "database.db",
  //logging: false,
});

class Allegiance extends Model {}
Allegiance.init(
  {
    endDate: DataTypes.DATE,
    top: DataTypes.BOOLEAN,
    parent: DataTypes.INTEGER,
    titleId: DataTypes.INTEGER,
  },
  { sequelize, modelName: "allegiance" }
);

const insertAllegiance = (transaction) =>
  es.map(async (data, callback) => {
    data.titles.forEach(async (title) => {
      await Allegiance.create(
        {
          endDate: data.endDate,
          top: data.parent === title,
          parent: data.parent,
          titleId: title,
        },
        { transaction }
      );
    });
    callback();
  });

(async () => {
  await sequelize.sync();

  await Allegiance.truncate();

  const populateAllegiancesTransaction = await sequelize.transaction();

  // Generate past title allegiances
  const pastAllegiances = saveFileStream
    .pipe(JSONStream.parse(["dead_unprunable", { emitKey: true }]))
    .pipe(
      es.map((data, callback) => {
        const date = parseDate(data?.value?.dead_data?.date);
        const domain = data?.value?.dead_data?.domain || [];
        const liegeTitle = data?.value?.dead_data?.liege_title;

        if (date && domain.length > 0 && (liegeTitle || liegeTitle === 0)) {
          callback(null, {
            endDate: date,
            parent: liegeTitle,
            titles: domain,
          });
        } else {
          callback();
        }
      })
    );

  // Generate current title allegiance
  const currentAllegiances = saveFileStream
    .pipe(
      JSONStream.parse(["landed_titles", "landed_titles", { emitKey: true }])
    )
    .pipe(
      es.map((data, callback) => {
        const liegeTitle = data?.value?.de_facto_liege;
        const title = data?.key;

        callback(null, {
          endDate: new Date(1453, 1, 1),
          parent: liegeTitle === 0 || liegeTitle ? liegeTitle : title,
          titles: title ? [title] : [],
        });
      })
    );

  const output = mergeStream(currentAllegiances, pastAllegiances)
    .pipe(insertAllegiance(populateAllegiancesTransaction))
    .pipe(insertAllegiance(populateAllegiancesTransaction))
    .on("end", async () => await populateAllegiancesTransaction.commit());
})();
