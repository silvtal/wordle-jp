

const LetterState = {
  UnusedLetter: 0,
  WrongLetter: 1,
  WrongPlace: 2,
  RightPlace:3,
};

class LetterInfo {
  constructor(letter, state) {
    this.letter = letter;
    this.state = state;
  }
}

const totalRowCount = 6;

class Gamestate {

  /**
   * @param solution {String} The puzzle's solution.
   */
  constructor(solution) {

    /** @type {String} */
    this.solution = solution;

    /** @type {Array<String>} */
    this.rows = [""];

    /** @type {Number} */
    this.finishedRows = 0;
  }

  isSolved() {
    let word = this.rows[this.finishedRows];
    return word == this.solution;
  }

  isFinished() {
    if (this.finishedRows == this.rows.length) return true;
    if (this.isSolved()) return true;
    return false;
  }

  onGamestateChanged(handler) {
    document.addEventListener("gamestateChanged", handler);
  }

  removeLetter(letter) {
    if (this.isFinished()) throw "cannot remove letter in finished game";
    let word = this.rows[this.finishedRows];
    if (word.length == 0) throw "row is already empty";
    this.rows[this.finishedRows] = word.substr(0, word.length - 1);
    document.dispatchEvent(new Event("gamestateChanged"));
  }

  commitWord() {
    if (this.isFinished()) throw "cannot commit word in finished game";
    let word = this.rows[this.finishedRows];
    if (word.length != 5) throw "cannot commit word that does not have 5 characters";
    ++this.finishedRows;
    if (this.rows.length < totalRowCount) this.rows.push("");
    document.dispatchEvent(new Event("gamestateChanged"));
  }

  addLetter(letter) {
    if (this.isFinished()) throw "cannot add letter to finished game";
    if (this.rows[this.finishedRows].length == 5) throw "row is already full";
    this.rows[this.finishedRows] += letter;
    document.dispatchEvent(new Event("gamestateChanged"));
  }

  getActiveWord() {
    if (this.isFinished()) return null;
    return this.rows[this.finishedRows];
  }

  getMarkedLetters() {
    let res = new Map();
    for (let i = 0; i < this.finishedRows; ++i) {
      let word = this.rows[i];
      for (let j = 0; j < word.length; ++j) {
        let letter = word[j];
        if (this.solution.indexOf(letter) == -1) res.set(letter, LetterState.WrongLetter);
        else {
          let ls = j == this.solution.indexOf(letter) ? LetterState.RightPlace : LetterState.WrongPlace;
          if (!res.has(letter) || res.get(letter) == LetterState.WrongPlace)
            res.set(letter, ls);
        }
      }
    }
    return res;
  }

  getFinishedRow(ix) {
    let word = this.rows[ix];
    let res = [];
    for (let pos = 0; pos < word.length; ++pos) {
      let ls = LetterState.WrongLetter;
      if (this.solution[pos] == word[pos]) ls = LetterState.RightPlace;
      else if (this.solution.indexOf(word[pos]) != -1) ls = LetterState.WrongPlace;
      res.push(new LetterInfo(word[pos], ls));
    }
    return res;
  }
}

export { LetterState, LetterInfo, Gamestate };
