const fs = require("fs");
const { execFile } = require("child_process");
const path = require("path");
const JSONStream = require("JSONStream");
const es = require("event-stream");
const moment = require("moment");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const mergeStream = require("merge-stream");
const getStream = require("get-stream");

const parseDate = (str) => {
  return moment(str, "yyyy.MM.dd").utc().toDate();
};

const CK3_JSON_EXE = "./ck3json.exe";
const TITLE_DEF_FILE = "game/common/landed_titles/00_landed_titles.txt";
const MAP_DATA_PATH = "game/map_data";
const PROVINCE_PNG_FILE = "provinces.png";
const PROVINCE_DEF_FILE = "definition.csv";

const [saveFilepath, installRootFilepath] = process.argv.slice(2);

const saveFileStream = execFile(CK3_JSON_EXE, [
  path.join(saveFilepath),
]).stdout.pipe(
  es.mapSync((data) => {
    return data.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
  })
);

(async () => {
  const db = await open({
    filename: "database.db",
    driver: sqlite3.Database,
  });

  // MIGRATIONS
  //await db.exec('CREATE TABLE Allegiances (EndDate DATE, Top BOOLEAN, Parent INT, TitleId INT, FOREIGN KEY (TitleId) REFERENCES Titles(Id)')
  await db.exec(
    "CREATE TABLE IF NOT EXISTS Allegiances (EndDate DATE, Top BOOLEAN NOT NULL, Parent INT, TitleId INT NOT NULL);"
  );

  // CLEAN TABLES
  await db.exec("DELETE FROM Allegiances;");

  // BEGIN DB TRANSACTION
  await db.exec("BEGIN TRANSACTION;");

  const insertAllegiance = es.mapSync(async (data) => {
    data.titles.forEach(async (title) => {
      await db.run(
        "INSERT INTO Allegiances(EndDate, Top, Parent, TitleId) VALUES (:endDate, :top, :parent, :titleId);",
        {
          ":endDate": data.endDate,
          ":top": data.parent === title,
          ":parent": data.parent,
          ":titleId": title,
        }
      );
    });
  });

  // const endDate = await getStream(
  //   saveFileStream
  //     .pipe(JSONStream.parse(["meta_data", "meta_date", { emitKey: true }]))
  //     .pipe(
  //       es.mapSync((data) => {
  //         return data?.value;
  //       })
  //     )
  // );

  // console.log(endDate);

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
      es.mapSync((data) => {
        const liegeTitle = data?.value?.de_facto_liege;
        const title = data?.key;

        return {
          endDate: new Date(1453, 1, 1),
          parent: liegeTitle === 0 || liegeTitle ? liegeTitle : title,
          titles: title ? [title] : [],
        };
      })
    );

  const allegiances = mergeStream(currentAllegiances, pastAllegiances)
    //allegiances.pipe(es.mapSync(console.log))
    .pipe(insertAllegiance)
    .pipe(
      es.mapSync(async () => {
        await db.exec("COMMIT TRANSACTION;");
      })
    );
})();
