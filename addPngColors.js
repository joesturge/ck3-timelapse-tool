require("dotenv").config({ path: require("find-config")(".env") });

const es = require("event-stream");
const { Sequelize } = require("sequelize");
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
    return Color.rgb(obj?.map((str) => parseInt(str)))?.hex();
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

  fs.createReadStream("definition.csv", { encoding: "utf-8" })
    .pipe(es.split())
    .pipe(
      es.through(async function write(data) {
        this.emit(
          "data",
          data.split(";").map((str) => str.trim())
        );
      })
    )
    .pipe(
      es.through(async function write(data) {
        const [, r, g, b, barony] = data;

        if (barony) {
          const color = parseColor([r, g, b]);
          const key = "b_" + barony?.toLowerCase();
          this.emit("data", { key, color });
        }
      })
    )
    .pipe(
      es.through(async function write(data) {
        await Title.update(
          {
            pngColor: data.color,
          },
          {
            where: {
              key: data.key,
            },
          }
        );
      })
    )
    .on("end", async () => await transaction.commit());
})();
