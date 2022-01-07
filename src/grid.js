import {LetterState, LetterInfo, Gamestate} from "./gamestate.js";

class Grid {
  constructor(elm, gamestate) {
    this.elm = elm;
    this.gamestate = gamestate;
    this.updateView();
    this.initEvents();
  }

  initEvents() {

  }

  updateView() {
    let elmRows = this.elm.querySelectorAll(".row");
    for (let rowIx = 0; rowIx < elmRows.length; ++rowIx) {
      let elmKeys = elmRows[rowIx].children;
      let fr = null;
      if (rowIx < this.gamestate.finishedRows)
        fr = this.gamestate.getFinishedRow(rowIx);
      for (let colIx = 0; colIx < elmKeys.length; ++colIx) {
        let elmKey = elmKeys[colIx];
        elmKey.classList.remove("hit", "miss", "near", "filled");
        elmKey.innerText = "";
        if (rowIx >= this.gamestate.rows.length) continue;
        if (fr == null && colIx < this.gamestate.rows[rowIx].length) {
          elmKey.innerText = this.gamestate.rows[rowIx][colIx];
          elmKey.classList.add("filled");
          continue;
        }
        else if (fr != null) {
          elmKey.innerText = fr[colIx].letter;
          if (fr[colIx].state == LetterState.RightPlace) elmKey.classList.add("hit");
          else if (fr[colIx].state == LetterState.WrongPlace) elmKey.classList.add("near");
          else if (fr[colIx].state == LetterState.WrongLetter) elmKey.classList.add("miss");
        }
      }
    }
  }
}

export {Grid};

