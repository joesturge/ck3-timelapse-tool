const { duplex, stringify } = require("event-stream");
const { through, split } = require("event-stream");
const { on } = require("events");
const fs = require("fs");
const moo = require("moo");
const { type } = require("os");

const comment = {
  match: /\s*#.*/,
  value: (s) => s.replace("#", "").trim(),
};
const blank = {
  match: /[\t ]+/,
};

const JominiStream = () => {
  const lexer = moo.states({
    descend: {
      header: /SAV.+/,
      ascend: {
        match: /\s*}/,
        pop: 1,
      },
      objectStart: {
        match: /(?=\s*[^=]+=)/,
        push: "object",
      },
      arrayStart: {
        match: /(?=\s*(?:"[^={}]+"|[^={}\s]+|{))/,
        push: "array",
      },
    },
    object: {
      key: {
        match: /\s*[^=]+(?==)/,
        value: (s) => s.trim(),
      },
      value: {
        match: /=\s*(?:"[^={}]+"|[^={}\s]+)/,
        value: (s) => s.replace(/["=]/g, "").trim(),
      },
      descend: {
        match: /=\s*{/,
        push: "descend",
      },
      objectEnd: {
        match: /(?=\s*})/,
        pop: 1,
      },
      comment,
      blank,
    },
    array: {
      arrayValue: {
        match: /\s*(?:"[^={}]+"|[^={}\s]+)/,
        value: (s) => s.replace(/"/g, "").trim(),
      },
      descend: {
        match: /\s*{/,
        push: "descend",
      },
      arrayEnd: {
        match: /(?=\s*})/,
        pop: 1,
      },
      comment,
      blank,
    },
  });

  var lexerLine = 1;
  const path = [];

  const splitterStream = split();
  const lexingStream = splitterStream.pipe(
    through(function write(data) {
      this.pause();

      lexer.reset(data, { ...lexer.save(), line: lexerLine++, col: 0 });

      for (let token of lexer) {
        switch (token.type) {
          case "key":
            path.push(token.value);
            break;
          case "value":
            path.pop();
            this.emit("data", { path, value: token.value });
            break;
          case "arrayStart":
            path.push("*");
            break;
          case "arrayEnd":
            path.pop();
            path.pop();
            break;
          case "objectEnd":
            if(path.at(-1) !== "*") {
              path.pop();
            }
            break;
          case "arrayValue":
            this.emit("data", { path, value: token.value });
          default:
        }
      }

      this.resume();
    })
  );

  return duplex(splitterStream, lexingStream);
};

fs.createReadStream("test/data/sample.txt", { encoding: "utf-8" })
  .pipe(JominiStream(["k_papal_state"]))
  .pipe(stringify())
  .pipe(fs.createWriteStream("output.jsonl"));
