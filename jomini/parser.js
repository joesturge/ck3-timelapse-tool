const { duplex, replace, filterSync, mapSync } = require("event-stream");
const { through, split } = require("event-stream");
const chunker = require("stream-chunker");
const moo = require("moo");

const ChunkingStream = (size) => {
  var chunk = "";

  return through(
    function write(data) {
      this.pause();

      chunk = chunk + data;

      if (chunk.length > size) {
        this.emit("data", chunk);
        chunk = "";
      }

      this.resume();
    },
    function end() {
      this.emit("data", chunk);
      chunk = "";
      this.emit("end");
    }
  );
};

const TokenizerStream = () => {
  const lexer = moo.compile({
    comment: {
      match: /\s*#.*$/,
      value: (s) => s.replace("#", "").trim(),
    },
    ignore: /^SAV.*$/,
    value: {
      match: /\s*(?:[a-zA-Z]+\s*{[^{}]+}|"[^"]+"|[^#={}\s]+)/,
      value: (s) => s.replace(/["]/g, "").trim(),
    },
    descend: /\s*{/,
    ascend: /\s*}/,
    equals: /\s*=/,
    blank: {
      match: /[\t ]+/,
    },
  });

  const splitterStream = split();

  var lexerLine = 0;

  const tokenizingStream = splitterStream.pipe(
    through(
      function write(data) {
        this.pause();
        if (lexerLine % 10000 === 0) {
          console.log(lexerLine);
        }
        if (lexerLine === 0) {
          this.emit("data", { type: "descend" });
        }
        lexer.reset(data, { ...lexer.save(), line: lexerLine++, col: 0 });
        for (let token of lexer) {
          this.emit("data", { type: token.type, value: token.value });
        }

        this.resume();
      },
      function end() {
        this.emit("data", { type: "ascend" });
        this.emit("end");
      }
    )
  );

  return duplex(splitterStream, tokenizingStream);
};

const JsonLexingStream = () => {
  const isValue = (str) => str === "value" || str === "valueComma";

  const stack = [];
  const history = [null, null, null];

  const instructions = [
    {
      print: () => {
        stack.push("}");
        return "{";
      },
      match: (history) =>
        history.at(0)?.type === "descend" &&
        isValue(history.at(1)?.type) &&
        history.at(2)?.type === "equals",
      push: "}",
    },
    {
      print: () => {
        stack.push("]");
        return "[";
      },
      match: (history) =>
        history.at(0)?.type === "descend" &&
        isValue(history.at(1)?.type) &&
        isValue(history.at(2)?.type),
      push: "]",
    },
    {
      print: () => {
        stack.push("]");
        return "[";
      },
      match: (history) =>
        history.at(0)?.type === "descend" &&
        isValue(history.at(1)?.type) &&
        history.at(2)?.type === "ascend",
      push: "]",
    },
    {
      print: () => {
        stack.push("]");
        return "[";
      },
      match: (history) =>
        history.at(0)?.type === "descend" && history.at(1)?.type === "descend",
    },
    {
      print: () => {
        stack.push("}");
        return "{";
      },
      match: (history) =>
        history.at(0)?.type === "descend" && history.at(1)?.type === "ascend",
    },
    {
      print: () => stack.pop(),
      match: (history) => history.at(0)?.type === "ascend",
    },
    {
      print: () => stack.pop() + ",",
      match: (history) => history.at(0)?.type === "ascendComma",
    },
    {
      print: () => JSON.stringify(history.at(0)?.value),
      match: (history) => history.at(0)?.type === "value",
    },
    {
      print: () => JSON.stringify(history.at(0)?.value) + ",",
      match: (history) => history.at(0)?.type === "valueComma",
    },
    {
      print: () => ":",
      match: (history) => history.at(0)?.type === "equals",
    },
  ];

  const removeBlanksAndComments = filterSync(
    (data) =>
      data.type !== "comment" && data.type !== "blank" && data.type !== "ignore"
  );

  const convertToJsonStream = removeBlanksAndComments.pipe(
    through(
      function write(data) {
        this.pause();

        // ensure history is the last 3 token types
        history.push(data);
        if (history.length > 3) {
          history.shift();
        }

        // print comma
        if (
          history.at(0)?.type === "equals" &&
          isValue(history.at(1)?.type) &&
          isValue(history.at(2)?.type)
        ) {
          history.at(1).type = "valueComma";
        }
        if (
          history.at(0)?.type === "descend" &&
          isValue(history.at(1)?.type) &&
          isValue(history.at(2)?.type)
        ) {
          history.at(1).type = "valueComma";
        }
        if (
          isValue(history.at(0)?.type) &&
          isValue(history.at(1)?.type) &&
          isValue(history.at(2)?.type)
        ) {
          history.at(0).type = "valueComma";
          history.at(1).type = "valueComma";
        }
        if (
          history.at(0)?.type === "ascend" &&
          history.at(1)?.type !== "ascend"
        ) {
          history.at(0).type = "ascendComma";
        }

        const output = instructions
          .find((instruction) => instruction.match(history))
          ?.print();

        if (Boolean(output)) {
          this.emit("data", output);
        }

        this.resume();
      },
      function end() {
        // flush out the rest of history after the stream has ended
        while (history.length > 0) {
          history.shift();

          const output = instructions
            .find((instruction) => instruction.match(history))
            ?.print();

          if (Boolean(output)) {
            this.emit("data", output);
          }
        }
        this.emit("end");
      }
    )
  );

  return duplex(removeBlanksAndComments, convertToJsonStream);
};

const LexingStream = () => {
  var currentKey;
  const path = [];

  return through(function write(data) {
    this.pause();
    switch (data.type) {
      case "key":
        currentKey = data.value;
        break;
      case "value":
        this.emit("data", {
          path: [...path, currentKey],
          value: data.value,
        });
        break;
      case "arrayStart":
        currentKey && path.push(currentKey);
        path.push(0);
        break;
      case "objectStart":
        if (!Number.isInteger(path.at(-1))) {
          currentKey && path.push(currentKey);
        }
        break;
      case "arrayEnd":
        path.pop();
        path.pop();
        break;
      case "objectEnd":
        if (Number.isInteger(path.at(-1))) {
          path.push(path.pop() + 1);
        } else {
          path.pop();
        }
        break;
      case "arrayValue":
        this.emit("data", { path, value: data.value });
        if (Number.isInteger(path.at(-1))) {
          path.push(path.pop() + 1);
        }
      default:
        break;
    }
    this.resume();
  });
};

const ParsingStream = () => {
  return through(function write(data) {
    this.emit("data", data);
  });
};

const JominiStream = (
  tokenizer = TokenizerStream(),
  lexer = LexingStream()
) => {
  tokenizer.pipe(lexer);
  return duplex(tokenizer, lexer);
};

module.exports = {
  JominiStream,
  TokenizerStream,
  LexingStream,
  ParsingStream,
  JsonLexingStream,
};
