import {puzzleWords, allWords} from "../words/words.js";


function shiftStr(str, val) {
  let res = "";
  for (let i = 0; i < str.length; ++i) {
    let cp = str.charCodeAt(i);
    res += String.fromCodePoint(cp + val);
  }
  return res;
}

class Words {

  isAcceptableWord(word) {
    word = shiftStr(word, 1);
    return allWords.has(word);
  }

  getPuzzleWord(ix) {
    let word = puzzleWords[ix];
    return shiftStr(word, -1);
  }
}

export {Words}
