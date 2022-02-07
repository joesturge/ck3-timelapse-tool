require("dotenv").config({ path: require("find-config")(".env") });

const { execFile } = require("child_process");
const path = require("path");
const JSONStream = require("JSONStream");
const es = require("event-stream");
const moment = require("moment");
const mergeStream = require("merge-stream");
const { Sequelize, Model, DataTypes } = require("sequelize");
const chunker = require("stream-chunker");

const parseDate = (str) => {
  return moment(str, "yyyy.MM.dd").utc().toDate();
};

const childProcess = execFile("./bin/ck3json.exe", [
  process.env.SAVE_FILE_PATH,
]);
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
    es.mapSync((data) => {
      return data.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
    })
  );

const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: "database.db",
  logging: false,
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
  es.mapSync(async (data) => {
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
  });

(async () => {
  await sequelize.sync();

  await Allegiance.truncate();

  const populateAllegiancesTransaction = await sequelize.transaction();

  // Generate past title allegiances
  const pastAllegiances = saveFileStream
    .pipe(JSONStream.parse(["dead_unprunable", { emitKey: true }]))
    .pipe(
      es.mapSync((data) => {
        const date = parseDate(data?.value?.dead_data?.date);
        const domain = data?.value?.dead_data?.domain || [];
        const liegeTitle = data?.value?.dead_data?.liege_title;

        if (date && domain.length > 0 && (liegeTitle || liegeTitle === 0)) {
          return {
            endDate: date,
            parent: liegeTitle,
            titles: domain,
          };
        }
      })
    );

  // Generate current title allegiance
  const currentAllegiances = saveFileStream
    .pipe(
      JSONStream.parse(["landed_titles", "landed_titles", { emitKey: true }])
    )
    .pipe(
      es.mapSync((data, callback) => {
        const liegeTitle = data?.value?.de_facto_liege;
        const title = data?.key;

        return {
          endDate: new Date(1453, 1, 1),
          parent: liegeTitle === 0 || liegeTitle ? liegeTitle : title,
          titles: title ? [title] : [],
        };
      })
    );

  const output = mergeStream(currentAllegiances, pastAllegiances)
    .pipe(insertAllegiance(populateAllegiancesTransaction))
    .on("end", async () => await populateAllegiancesTransaction.commit());
})();
