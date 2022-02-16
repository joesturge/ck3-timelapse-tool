require("dotenv").config({ path: require("find-config")(".env") });

const JSONStream = require("JSONStream");
const es = require("event-stream");
const { Sequelize } = require("sequelize");
const { JominiStream } = require("./jomini/parser");
const fs = require("fs");
const BuildModels = require("./src/model");
const Color = require("color");

const rgbRegex = /^\s*rgb\s*{\s*(\d+)\s*(\d+)\s*(\d+)\s*}\s*$/;
const hsvRegex = /^\s*hsv\s*{\s*([\d\.]+)\s*([\d\.]+)\s*([\d\.]+)\s*}\s*$/;
const parseColor = (obj) => {
  if (Boolean(obj)) {
    if (
      (typeof obj === "string" || obj instanceof String) &&
      rgbRegex.test(obj)
    ) {
      return Color.rgb(
        rgbRegex
          .exec(obj)
          .slice(1, 4)
          .map((str) => parseInt(str))
      )?.hex();
    }
    if (
      (typeof obj === "string" || obj instanceof String) &&
      hsvRegex.test(obj)
    ) {
      return Color.hsv(
        hsvRegex
          .exec(obj)
          .slice(1, 4)
          .map((str) => parseFloat(str))
      ).hex();
    }
    return Color.rgb(obj?.map(str => parseInt(str)))?.hex();
  }
  return null;
};

const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: "database.db",
  logging: false,
});

(async () => {
  const { Title } = BuildModels(sequelize);

  await sequelize.sync();

  const transaction = await sequelize.transaction();

  const titleFileStream = fs
    .createReadStream("00_landed_titles.txt", { encoding: "utf-8" })
    .pipe(JominiStream());

  es.merge(
    titleFileStream.pipe(
      JSONStream.parse([{ emitKey: true }], (data) => data?.color)
    ),
    titleFileStream.pipe(
      JSONStream.parse([true, { emitKey: true }], (data) => data?.color)
    ),
    titleFileStream.pipe(
      JSONStream.parse([true, true, { emitKey: true }], (data) => data?.color)
    ),
    titleFileStream.pipe(
      JSONStream.parse(
        [true, true, true, { emitKey: true }],
        (data) => data?.color
      )
    ),
    titleFileStream.pipe(
      JSONStream.parse(
        [true, true, true, true, { emitKey: true }],
        (data) => data?.color
      )
    )
  )
    .pipe(
      es.through(async function write(data) {
        const color = parseColor(data.value);
        console.log(data.key, data.value, color);
        await Title.update(
          {
            color,
          },
          {
            where: {
              key: data.key,
              color: null,
            },
          }
        );
      })
    )
    .on("end", async () => await transaction.commit());
})();
