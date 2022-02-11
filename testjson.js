const { stringify, mapSync } = require("event-stream");
const fs = require("fs");
const { JominiStream, TokenizerStream, JsonLexingStream } = require("./jomini/parser");
const JSONStream = require("JSONStream");

fs.createReadStream("udonen_1453_01_01_debug.ck3", { encoding: "utf-8" })
  .pipe(TokenizerStream())
  .pipe(JsonLexingStream())
  .pipe(fs.createWriteStream("hello.json"));
