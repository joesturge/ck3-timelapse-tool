require("dotenv").config({ path: require("find-config")(".env") });

const JSONStream = require("JSONStream");
const es = require("event-stream");
const moment = require("moment");
const { Sequelize } = require("sequelize");
const { JominiStream } = require("./jomini/parser");
const fs = require("fs");
const BuildModels = require("./src/model");
const Color = require("color");

const parseDate = (str) => {
  return Boolean(str) ? moment(str, "yyyy.MM.dd").utc().toDate() : null;
};

const rgbRegex = /^\s*rgb\s*{\s*(\d+)\s*(\d+)\s*(\d+)\s*}\s*$/;
const parseColor = (obj) => {
  if (Boolean(obj)) {
    if ((typeof obj === "string" || obj instanceof String) && rgbRegex.test(obj)) {
      return Color.rgb(rgbRegex.exec(obj).slice(1, 4).map(str => parseInt(str)))?.hex();
    }
    return Color.rgb(obj)?.hex();
  }
  return null;
};

const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: "database.db",
  logging: false,
});

const endDate = parseDate("1453.1.1");

(async () => {
  const { Person, Title, TitleHistory } = BuildModels(sequelize);

  await sequelize.sync({ alter: true });

  const transaction = await sequelize.transaction();

  await sequelize.truncate({ transaction });

  // Generate past title allegiances
  const saveFileStream = fs
    .createReadStream("udonen_1453_01_01_debug.ck3", { encoding: "utf-8" })
    .pipe(JominiStream());

    saveFileStream.pause();

  es.merge(
    saveFileStream
      .pipe(
        JSONStream.parse(["landed_titles", "landed_titles", { emitKey: true }])
      )
      .pipe(
        es.through(async function write(data) {
          this.pause();
          const title = {
            id: data?.key,
            key: data?.value?.key,
            name: data?.value?.name,
            deFactoLiege: data?.value?.de_facto_liege,
            deJureLiege: data?.value?.de_jure_liege,
            rank: data?.value?.key?.charAt(0)?.toUpperCase(),
            color: parseColor(data?.value?.color),
          };

          if (Boolean(title.key)) {
            const waitFor = [Title.create(title, { transaction })];
            const history = data?.value?.history;

            if (Boolean(history)) {
              const keys = Object.keys(history);
              for (var i = 0; i < keys.length; i++) {
                const item = history[keys.at(i)];
                const nextKey = i + 1 < keys.length ? keys.at(i + 1) : null;
                const holder =
                  typeof item === "string" || item instanceof String
                    ? item
                    : item?.holder;

                if (Boolean(holder)) {
                  const titleHistory = {
                    title: data?.key,
                    holder,
                    startDate: parseDate(keys[i]),
                    endDate: Boolean(nextKey) ? parseDate(nextKey) : endDate,
                  };
                  waitFor.push(
                    TitleHistory.create(titleHistory, { transaction })
                  );
                }
              }
            }

            await Promise.all(waitFor);
          }

          this.resume();
        })
      ),
    saveFileStream
      .pipe(JSONStream.parse([/dead_unprunable|living/, { emitKey: true }]))
      .pipe(
        es.through(async function write(data) {
          this.pause();
          const person = {
            id: data?.key,
            firstName: data?.value?.first_name,
            dateOfBirth: parseDate(data?.value?.birth),
            dateOfDeath: parseDate(data?.value?.dead_data?.date),
            sex: data?.value?.female === "yes" ? "Female" : "Male",
            primaryTitle:
              data?.value?.dead_data?.domain?.at(0) ||
              data?.value?.landed_data?.domain?.at(0),
            liege:
              data?.value?.dead_data?.liege === data?.key
                ? null
                : data?.value?.dead_data?.liege,
          };
          await Person.create(person, { transaction });
          this.resume();
        })
      )
  ).on("end", async () => await transaction.commit());

  saveFileStream.resume();
})();
