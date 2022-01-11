import {LetterState, LetterInfo, Gamestate} from "./gamestate.js";

class Grid {
  constructor(elm, gamestate) {
    this.elm = elm;
    this.gamestate = gamestate;
    this.updateView();
    this.updateAppearance();
    window.addEventListener("resize", () => this.updateAppearance());
  }

  updateAppearance() {
    let height = this.elm.offsetHeight;
    let elmRows = this.elm.querySelectorAll(".row");
    for (const elmRow of elmRows) {
      if (height < 300) elmRow.style.padding = "2px";
      else elmRow.style.padding = "4px";
    }
    let elmTiles = this.elm.querySelectorAll(".tile");
    let tileSize = height / 5 - 8;
    if (tileSize > elmTiles[0].offsetHeight)tileSize = elmTiles[0].offsetHeight
    for (const elmTile of elmTiles) {
      elmTile.style.width = tileSize + "px";
      elmTile.style.fontSize = Math.floor(elmTile.offsetHeight * 0.6) + "px";
      if (height < 300) elmTile.style.margin = "2px";
    }
    this.elm.style.visibility = "visible";
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
        elmKey.innerHTML = "<span>&nbsp;</span>";
        if (rowIx >= this.gamestate.rows.length) continue;
        if (fr == null && colIx < this.gamestate.rows[rowIx].length) {
          elmKey.innerHTML = "<span>" + this.gamestate.rows[rowIx][colIx] + "</span>";
          elmKey.classList.add("filled");
          continue;
        }
        else if (fr != null) {
          elmKey.innerHTML = "<span>" + fr[colIx].letter + "</span>";
          if (fr[colIx].state == LetterState.RightPlace) elmKey.classList.add("hit");
          else if (fr[colIx].state == LetterState.WrongPlace) elmKey.classList.add("near");
          else if (fr[colIx].state == LetterState.WrongLetter) elmKey.classList.add("miss");
        }
      }
    }
  }
}

export {Grid};

