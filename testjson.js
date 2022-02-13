const { stringify, mapSync } = require("event-stream");
const fs = require("fs");
const { JominiStream } = require("./jomini/parser");
const JSONStream = require("JSONStream");

const mergeStream = require("merge-stream");

process.setMaxListeners(0);

const titlesStream = fs
  .createReadStream(
    "c:/Program Files (x86)/Steam/steamapps/common/Crusader Kings III/game/common/landed_titles/00_landed_titles.txt",
    { encoding: "utf-8" }
  )
  .pipe(JominiStream())
  .setMaxListeners(0);

mergeStream(
  titlesStream.pipe(
    JSONStream.parse(
      [true, true, true, true, { emitKey: true }],
      (data) => data?.color
    )
  ),
  titlesStream.pipe(
    JSONStream.parse(
      [true, true, true, { emitKey: true }],
      (data) => data?.color
    )
  ),
  titlesStream.pipe(
    JSONStream.parse([true, true, { emitKey: true }], (data) => data?.color)
  ),
  titlesStream.pipe(
    JSONStream.parse([true, { emitKey: true }], (data) => data?.color)
  ),
  titlesStream.pipe(
    JSONStream.parse([{ emitKey: true }], (data) => data?.color)
  )
).on("data", data => console.log(data));
