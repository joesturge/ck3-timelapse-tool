const { duplex } = require("event-stream");
const { through, split } = require("event-stream");
const { on } = require("events");
const fs = require("fs");
const moo = require("moo");

const JominiStream = () => {
  const lexer = moo.states({
    object: {
      key: {
        match: /[^=]+=/,
        value: (s) => s.replace(/=/, "").trim(),
        next: "field",
      },
      comment: /#.+/,
      arrayItem: {
        match: /\s*(?:"[^={}]+"|[^={}\s]+)\s*/,
        value: (s) => s.replace(/=/, "").trim(),
      },
      objectEnd: {
        match: /s*}\s*/,
        pop: 1,
      },
      ignore: /./,
    },
    field: {
      fieldItem: {
        match: /(?<==)\s*(?:"[^={}]+"|[^={}\s]+)/,
        value: (s) => s.trim().replace(/"/g, ""),
        next: "object",
      },
      objectStart: {
        match: /(?<==)\s*{\s*/,
        push: "object",
      },
    },
  });

  var lexerLine = 0;

  const path = [];

  const splitterStream = split();
  const lexingStream = splitterStream.pipe(
    through(function write(data) {
      this.pause();

      lexer.reset(data, { ...lexer.save(), line: lexerLine++, col: 0 });
      console.log("after", lexer.stack, lexer.state)

      for (let token of lexer) {
        this.emit("data", token);
      }

      this.resume();
    })
  );

  return duplex(splitterStream, lexingStream);
};

fs.createReadStream("test/data/sample.txt", { encoding: "utf-8" }).pipe(
  JominiStream(["k_papal_state"])
)
.on("data", console.log);
