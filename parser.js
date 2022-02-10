const { duplex, stringify } = require("event-stream");
const { through, split } = require("event-stream");
const fs = require("fs");
const moo = require("moo");

const comment = {
  match: /\s*#.*$/,
  value: (s) => s.replace("#", "").trim(),
};
const blank = {
  match: /[\t ]+/,
};

const TokenizerStream = () => {
  const lexer = moo.states({
    descend: {
      comment,
      header: /SAV.+/,
      ascend: {
        match: /\s*}/,
        pop: 1,
      },
      objectStart: {
        match: /(?=\s*[^#=]+=)/,
        push: "object",
      },
      arrayStart: {
        match: /(?=\s*(?:"[^#={}]+"|[^#={}\s]+|{))/,
        push: "array",
      },
      blank,
    },
    object: {
      comment,
      key: {
        match: /\s*[^=]+(?==)/,
        value: (s) => s.trim(),
      },
      value: {
        match: /=\s*(?:[a-zA-Z]+\s*{[^#{}]+}|"[^#={}]+"|[^#={}\s]+)/,
        value: (s) => s.replace(/["=]/g, "").trim(),
      },
      descend: {
        match: /=\s*{\s*(?:#.+)?/,
        push: "descend",
      },
      objectEnd: {
        match: /(?=\s*})/,
        pop: 1,
      },
      blank,
    },
    array: {
      comment,
      arrayValue: {
        match: /\s*(?:[a-zA-Z]+\s*{[^#{}]+}|"[^={}]+"|[^={}\s]+)/,
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
      blank,
    },
  });

  var lexerLine = 1;

  const splitterStream = split();

  const tokenizingStream = splitterStream.pipe(
    through(function write(data) {
      this.pause();
      lexer.reset(data, { ...lexer.save(), line: lexerLine++, col: 0 });
      for (let token of lexer) {
        this.emit("data", { type: token.type, value: token.value });
      }

      if (lexerLine % 10000 === 0) {
        console.log(lexerLine);
      }

      this.resume();
    })
  );

  return duplex(splitterStream, tokenizingStream);
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
  lexer = LexingStream(),
  parser = ParsingStream()
) => {
  tokenizer.pipe(lexer).pipe(parser);
  return duplex(tokenizer, parser);
};

module.exports = {
  JominiStream,
  TokenizerStream,
  LexingStream,
  ParsingStream,
};
