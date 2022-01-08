const fs = require("fs");
const path = require("path");
const md5 = require('md5')

async function getHash(fn) {
  let content = await fs.promises.readFile(fn, "utf8");
  return md5(content);
}

function mulberry32(seed) {
  return function () {
    var t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

const rand = mulberry32(43);

function shuffle(array) {
  var currentIndex = array.length, randomIndex;
  while (currentIndex != 0) {
    randomIndex = Math.floor(rand() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }
  return array;
}

function buildWordsJs(pws, ows) {
  return `let puzzleWords = [
${pws}
];
let otherWords = [
${ows}
];

export {puzzleWords, otherWords};
`;
}

function shiftStr(str) {
  let res = "";
  for (let i = 0; i < str.length; ++i) {
    let cp = str.charCodeAt(i);
    res += String.fromCodePoint(cp + 1);
  }
  return res;
}

async function prepWords() {
  let wordsAll = await fs.promises.readFile("words/hu-words-5-filtered.txt", "utf8");
  let words = wordsAll.split(/\r?\n/);
  words = shuffle(words);
  let pws = "", ows = "";
  for (const w of words) {
    if (w == "") continue;
    if (w.startsWith(".")) {
      let word = shiftStr(w.substr(1));
      ows += `"${word}",\n`;
    }
    else {
      let word = shiftStr(w);
      pws += `"${word}",\n`;
    }
  }
  let wordsJs = buildWordsJs(pws, ows);
  await fs.promises.writeFile("words/words.js", wordsJs);
}

exports = (options = {}) => {
  return {
    name: 'customTasks',
    setup(build) {
      build.onStart(async () => {
        if (!options.prod) return;
        await prepWords();
        try { fs.unlinkSync("public/app.js.map"); } catch {}
        try { fs.unlinkSync("public/app.css.map"); } catch {}
      });
      build.onEnd(async result => {
        let indexHtml = await fs.promises.readFile("index.html", "utf8");
        if (options.prod) {
          let appJsHash = await getHash("public/app.js");
          let appCssHash = await getHash("public/app.css");
          indexHtml = indexHtml.replace("./app.js", "./app." + appJsHash + ".js");
          indexHtml = indexHtml.replace("./app.css", "./app." + appCssHash + ".css");
          indexHtml = indexHtml.replace(/<!--LiveReload-->.*<!--LiveReload-->/is, "");
        }
        await fs.promises.writeFile("public/index.html", indexHtml);
      });
    }
  };
}
module.exports = exports;
