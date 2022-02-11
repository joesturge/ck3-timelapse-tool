const { writeArray, split, parse, stringify } = require("event-stream");
const fs = require("fs");
const {
  JominiStream,
  TokenizerStream,
  LexingStream,
  ParsingStream,
  JsonLexingStream,
} = require("../jomini/parser");
const tmp = require("tmp");

const getStreamItems = (stream) =>
  new Promise((resolve, reject) =>
    // Theres a bug in write array where arrays with numbers and text are not being parsed correctly hence this workaround
    stream.pipe(stringify()).pipe(
      writeArray((err, array) => {
        err && reject(err);
        array && resolve(array.map(JSON.parse));
      })
    )
  );

const getStreamAsString = (stream) =>
  new Promise((resolve, reject) =>
    stream.pipe(
      writeArray((err, array) => {
        err && reject(err);
        array && resolve(array.join(""));
      })
    )
  );

const writeActual = (objects, name) => {
  const tmpFile = tmp.fileSync({ postfix: name });
  objects.forEach((object, index) => {
    fs.appendFileSync(
      tmpFile.fd,
      JSON.stringify(object) + (index === objects.length - 1 ? "" : "\r\n")
    );
  });
  console.log(`Actual result written to: ${tmpFile.name}`);
};

const writeActualString = (json, name) => {
  const tmpFile = tmp.fileSync({ postfix: name });
  fs.appendFileSync(tmpFile.fd, json);
  console.log(`Actual result written to: ${tmpFile.name}`);
};

test("Can tokenize raw input", async () => {
  // GIVEN an raw input stream
  const rawInput = fs.createReadStream("test/data/sample-raw.txt", {
    encoding: "utf-8",
  });

  // WHEN piping it through the tokenizer
  const result = await getStreamAsString(rawInput.pipe(TokenizerStream()).pipe(JsonLexingStream()));

  // THEN the output is correct
  const expected = await getStreamItems(
    fs
      .createReadStream("test/data/sample-token.jsonl")
      .pipe(split())
      .pipe(parse())
  );
  writeActualString(result, "sample-token.json");
  expect(result).toEqual(expected);
});

// test("Can lex token stream", async () => {
//   // GIVEN an token input stream
//   const tokenInput = fs.createReadStream("test/data/sample-token.jsonl", {
//     encoding: "utf-8",
//   });

//   // WHEN piping it through the lexer
//   const result = await getStreamItems(
//     tokenInput.pipe(split()).pipe(parse()).pipe(LexingStream())
//   );

//   // THEN the output is correct
//   const expected = await getStreamItems(
//     fs
//       .createReadStream("test/data/sample-lexed.jsonl")
//       .pipe(split())
//       .pipe(parse())
//   );
//   writeActual(result, "sample-lexed.jsonl");
//   expect(result).toEqual(expected);
// });

// test("Can parse lexed stream", async () => {
//   // GIVEN an lexed input stream
//   const rawInput = fs.createReadStream("test/data/sample-lexed.jsonl", {
//     encoding: "utf-8",
//   });

//   // WHEN piping it through the parser
//   const result = await getStreamItems(
//     rawInput.pipe(split()).pipe(parse()).pipe(ParsingStream())
//   );

//   // THEN the output is correct
//   const expected = await getStreamItems(
//     fs
//       .createReadStream("test/data/sample-parsed.jsonl")
//       .pipe(split())
//       .pipe(parse())
//   );
//   writeActual(result, "sample-parsed.jsonl");
//   expect(result).toEqual(expected);
// });

// test("Can convert raw Jomini text stream to object stream", async () => {
//   // GIVEN an raw input stream
//   const rawInput = fs.createReadStream("test/data/sample-raw.txt", {
//     encoding: "utf-8",
//   });

//   // WHEN piping it through the stream
//   const result = await getStreamItems(rawInput.pipe(JominiStream()));

//   // THEN the output is correct
//   const expected = await getStreamItems(
//     fs
//       .createReadStream("test/data/sample-parsed.jsonl")
//       .pipe(split())
//       .pipe(parse())
//   );
//   writeActual(result, "sample-parsed.jsonl");
//   expect(result).toEqual(expected);
// });

// test("Can convert token stream to raw json", async () => {
//   // GIVEN an raw input stream
//   const tokenInput = fs.createReadStream("test/data/sample-token.jsonl", {
//     encoding: "utf-8",
//   });

//   // WHEN piping it through the json lexer
//   const result = await getStreamAsString(
//     tokenInput.pipe(split()).pipe(parse()).pipe(JsonLexingStream())
//   );

//   const expected = JSON.parse(fs.readFileSync("test/data/sample-json.json"));

//   writeActualString(result, "sample-json.json");
//   expect(JSON.parse(result)).toEqual(expected);
// });
