const { duplex } = require("event-stream");
const { through, split } = require("event-stream");
const fs = require("fs");
const moo = require("moo");

const JominiStream = () => {
  const lexer = moo.states({
    object: {
      key: {
        match: /[^=]+=/,
        value: (s) => s.replace(/=/, "").trim(),
        push: "field",
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
        pop: 1,
      },
      objectStart: {
        match: /(?<==)\s*{\s*/,
        push: "object",
      },
    },
  });

  const path = [];

  const splitterStream = split();
  const lexingStream = splitterStream.pipe(
    through(
      function write(data) {
        this.pause();
        lexer.reset(data);
        for (let token of lexer) {
          switch (token.type) {
            case "key":
              path.push(token.value);
              this.emit("data", path);
              break;
            case "fieldItem":
              path.pop();
              break;
            case "objectEnd":
              path.pop();
              break;
            default:
              break;
          }
        }
        this.resume();
      },
      function end(data) {
        console.log("end");
      }
    )
  );

  return duplex(splitterStream, lexingStream);
};

fs.createReadStream("test/data/sample.txt", { encoding: "utf-8" })
  .pipe(JominiStream(["k_papal_state"]))
  .on("data", (data) => console.log("data", data));
