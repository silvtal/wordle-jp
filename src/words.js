import {puzzleWords, otherWords} from "../words/words.js";


function shiftStr(str, val) {
  let res = "";
  for (let i = 0; i < str.length; ++i) {
    let cp = str.charCodeAt(i);
    res += String.fromCodePoint(cp + val);
  }
  return res;
}

class Words {

  constructor() {
    this.allWords = new Set();
    puzzleWords.forEach(word => this.allWords.add(word));
    otherWords.forEach(word => this.allWords.add(word));
  }

  isAcceptableWord(word) {
    word = shiftStr(word, 1);
    return this.allWords.has(word);
  }

  getPuzzleWord(dayIx) {
    let word = puzzleWords[dayIx];
    return shiftStr(word, -1);
  }
}

export {Words}
