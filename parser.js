const { duplex } = require("event-stream");
const { through, split } = require("event-stream");
const { on } = require("events");
const fs = require("fs");
const moo = require("moo");

const comment = {
  match: /\s*#.*/,
  value: (s) => s.replace("#", "").trim(),
};
const blank = {
  match: /[\t ]+/
};

const JominiStream = () => {
  const lexer = moo.states({
    descend: {
      ascend: {
        match: /\s*}/,
        pop: 1
      },
      objectStart: {
        match: /(?=\s*[^=]+=)/,
        push: "object",
      },
      arrayStart: {
        match: /(?=\s*(?:"[^={}]+"|[^={}\s]+))/,
        push: "array",
      },
      arrayStart: {
        match: /(?=\s*(?:"[^={}]+"|[^={}\s]+))/,
        push: "array",
      },
      comment,
    },
    object: {
      key: {
        match: /\s*[^=]+(?==)/,
        value: (s) => s.trim(),
      },
      value: {
        match: /=\s*(?:"[^={}]+"|[^={}\s]+)/,
        value: (s) => s.replace("=", "").trim(),
      },
      descend: {
        match: /=\s*{+/,
        push: "descend",
      },
      objectEnd: {
        match: /(?=\s*})/,
        pop: 1
      },
      comment,
      blank
    },
    array: {
      value: {
        match: /\s*(?:"[^={}]+"|[^={}\s]+)/,
        value: (s) => s.replace("=", "").trim(),
      },
      arrayEnd: {
        match: /(?=\s*})/,
        pop: 1
      }
    }
  });

  var lexerLine = 1;

  const path = [];

  const splitterStream = split();
  const lexingStream = splitterStream.pipe(
    through(function write(data) {
      this.pause();

      lexer.reset(data, { ...lexer.save(), line: lexerLine++, col: 0 });

      for (let token of lexer) {
        this.emit("data", token);
      }

      this.resume();
    })
  );

  return duplex(splitterStream, lexingStream);
};

fs.createReadStream("test/data/sample.txt", { encoding: "utf-8" })
  .pipe(JominiStream(["k_papal_state"]))
  .on("data", console.log);
