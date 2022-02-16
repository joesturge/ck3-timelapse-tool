const { Sequelize, Op } = require("sequelize");
const BuildModels = require("./src/model");
const { PNG } = require("pngjs");
const fs = require("fs");
const Color = require("color");

const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: "database.db",
  logging: false,
});

const dir = "./timelapse";
if (fs.existsSync(dir)) {
  fs.rmdirSync(dir, { recursive: true });
}
fs.mkdirSync(dir);

const startYear = 0867;
const endYear = 1453;
const step = 20;

(async () => {
  const { Person, Title, TitleHistory } = BuildModels(sequelize);

  await sequelize.sync();

  const getParentTitle = async (title, date, depth = 0) => {
    if (depth > 10) {
      return title;
    }
    const { id: titleId, deFactoLiege } = title.get();
    const titleHistory = await TitleHistory.findOne({
      where: {
        title: titleId,
        startDate: {
          [Op.lte]: date,
        },
        endDate: {
          [Op.gt]: date,
        },
      },
    });

    if (!titleHistory) {
      return title;
    }

    const personId = titleHistory.get().holder;
    const person = await Person.findOne({
      where: {
        id: personId,
      },
    });

    if (!person) {
      return title;
    }

    const { dateOfDeath, liegeTitle } = person.get();

    var liegeTitleId = null;
    if (liegeTitle) {
      liegeTitleId = liegeTitle;
    } else if (!dateOfDeath) {
      liegeTitleId = deFactoLiege;
    }

    if (liegeTitleId) {
      const parent = await Title.findOne({
        where: {
          id: liegeTitleId,
        },
      });

      if (parent && parent.get().id !== titleId) {
        return await getParentTitle(parent, date, depth + 1);
      }
    }
    return title;
  };

  for (var year = startYear; year < endYear; year += step) {
    const date = new Date(year, 00, 01);
    const defaultColor = Color("#6F9EC3").rgb().array();
    const colorMap = Array(256 * 256 * 256);
    const addColor = (rgbIn, rgbOut) => {
      colorMap[rgbIn[0] * 256 * 256 + rgbIn[1] * 256 + rgbIn[2]] = rgbOut;
    };
    const getColor = (rgb) => {
      return colorMap[rgb[0] * 256 * 256 + rgb[1] * 256 + rgb[2]];
    };

    const baroniesQuery = await Title.findAll({
      where: {
        rank: "B",
        deJureLiege: {
          [Op.not]: null,
        },
      },
    });

    const baronies = baroniesQuery.map((q) => q.get());

    const countiesQuery = await Title.findAll({
      where: {
        rank: "C",
      },
    });

    const countyMap = [];

    for (var i = 0; i < countiesQuery.length; i++) {
      const county = countiesQuery[i];
      if (i % 100 === 0) {
        console.log(
          date.toISOString().slice(0, 10),
          ((100 * i) / 2600).toFixed(),
          "%"
        );
      }
      const liege = await getParentTitle(county, date);
      const data = { id: county.get()?.id, liege: liege.get() };
      countyMap.push(data);
    }

    baronies.forEach(async (barony) => {
      const county = countyMap.find(
        (county) => county.id === barony.deJureLiege
      );
      const color = county?.liege?.color;
      if (color) {
        addColor(
          Color(barony.pngColor).rgb().array(),
          Color(color).rgb().array()
        );
      }
    });

    fs.createReadStream("provinces.png")
      .pipe(
        new PNG({
          filterType: 4,
        })
      )
      .on("parsed", function () {
        for (var y = 0; y < this.height; y++) {
          for (var x = 0; x < this.width; x++) {
            var idx = (this.width * y + x) << 2;

            // invert color
            const r = this.data[idx];
            const g = this.data[idx + 1];
            const b = this.data[idx + 2];

            const [newR, newG, newB] = getColor([r, g, b]) || defaultColor;

            //console.log([r, g, b], [newR, newG, newB])
            this.data[idx] = newR;
            this.data[idx + 1] = newG;
            this.data[idx + 2] = newB;
          }
        }

        this.pack().pipe(
          fs.createWriteStream(
            `./timelapse/${date.toISOString().slice(0, 10)}.png`
          )
        );
      });
  }
})();
