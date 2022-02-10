const { writeArray, split, parse, stringify } = require("event-stream");
const fs = require("fs");
const { JominiStream, TokenizerStream, LexingStream, ParsingStream } = require("../parser");

const getStreamItems = (stream) =>
  new Promise((resolve, reject) =>
    // Theres a bug in wrtie array where arrays with numbers and text are not being parsed correctly hence this workaround
    stream.pipe(stringify()).pipe(
      writeArray((err, array) => {
        err && reject(err);
        array && resolve(array.map(JSON.parse));
      })
    )
  );

  test("Can tokenize raw input", async () => {
    // GIVEN an raw input stream
    const rawInput = fs.createReadStream("test/data/sample-raw.txt", {
      encoding: "utf-8",
    });
  
    // WHEN piping it through the tokenizer
    const result = await getStreamItems(rawInput.pipe(TokenizerStream()));
  
    // THEN the output is correct
    const expected = await getStreamItems(
      fs
        .createReadStream("test/data/sample-token.jsonl")
        .pipe(split())
        .pipe(parse())
    );
    expect(result).toEqual(expected);
  });

  test("Can lex token stream", async () => {
    // GIVEN an token input stream
    const rawInput = fs.createReadStream("test/data/sample-token.jsonl", {
      encoding: "utf-8",
    });
  
    // WHEN piping it through the tokenizer
    const result = await getStreamItems(rawInput.pipe(split()).pipe(parse()).pipe(LexingStream()));
  
    // THEN the output is correct
    const expected = await getStreamItems(
      fs
        .createReadStream("test/data/sample-lexed.jsonl")
        .pipe(split())
        .pipe(parse())
    );
    expect(result).toEqual(expected);
  });

  test("Can parse token stream", async () => {
    // GIVEN an lexed input stream
    const rawInput = fs.createReadStream("test/data/sample-lexed.jsonl", {
      encoding: "utf-8",
    });
  
    // WHEN piping it through the tokenizer
    const result = await getStreamItems(rawInput.pipe(split()).pipe(parse()).pipe(ParsingStream()));
  
    // THEN the output is correct
    const expected = await getStreamItems(
      fs
        .createReadStream("test/data/sample-parsed.jsonl")
        .pipe(split())
        .pipe(parse())
    );
    expect(result).toEqual(expected);
  });

  test("Can convert raw Jomini text stream to object stream", async () => {
    // GIVEN an raw input stream
    const rawInput = fs.createReadStream("test/data/sample-raw.txt", {
      encoding: "utf-8",
    });
  
    // WHEN piping it through the tokenizer
    const result = await getStreamItems(rawInput.pipe(JominiStream()));
  
    // THEN the output is correct
    const expected = await getStreamItems(
      fs
        .createReadStream("test/data/sample-parsed.jsonl")
        .pipe(split())
        .pipe(parse())
    );
    expect(result).toEqual(expected);
  });
