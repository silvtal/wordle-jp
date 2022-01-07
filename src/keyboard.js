import {LetterState, Gamestate} from "./gamestate.js";

class Keyboard {
  constructor(elm, gamestate) {
    this.elm = elm;
    this.gamestate = gamestate;
    this.updateView();
    this.initEvents();
  }

  onLetter(handler) {
    this.elm.addEventListener("letter", handler);
  }

  onBack(handler) {
    this.elm.addEventListener("back", handler);
  }

  onEnter(handler) {
    this.elm.addEventListener("enter", handler);
  }

  initEvents() {
    this.elm.addEventListener("click", e => {
      if (!e.target.classList.contains("key")) return;
      if (e.target.classList.contains("back"))
        this.elm.dispatchEvent(new Event("back"));
      else if (e.target.classList.contains("enter"))
        this.elm.dispatchEvent(new Event("enter"));
      else {
        this.elm.dispatchEvent(new CustomEvent("letter", {
          detail: e.target.innerText.toLowerCase(),
        }));
      }
    });
    document.addEventListener("keydown", e => this.onKeydown(e));
  }

  onKeydown(e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key == "Enter") {
      this.elm.dispatchEvent(new Event("enter"));
      return;
    }
    if (e.key == "Backspace") {
      this.elm.dispatchEvent(new Event("back"));
      return;
    }
    let key = e.key.toLowerCase();
    let elmKeys = this.elm.querySelectorAll(".key");
    for (const elmKey of elmKeys) {
      let letter = elmKey.innerText.toLowerCase();
      if (letter == key) {
        this.elm.dispatchEvent(new CustomEvent("letter", {
          detail: letter,
        }));
        return;
      }
    }
  }

  updateView() {
    let mls = this.gamestate.getMarkedLetters();
    let elmKeys = this.elm.querySelectorAll(".key");
    for (const elmKey of elmKeys) {
      let letter = elmKey.innerText.toLowerCase();
      elmKey.classList.remove("hit", "miss", "near");
      if (!mls.has(letter)) continue;
      let ls = mls.get(letter);
      if (ls == LetterState.WrongLetter) elmKey.classList.add("miss");
      else if (ls == LetterState.WrongPlace) elmKey.classList.add("near");
      else if (ls == LetterState.RightPlace) elmKey.classList.add("hit");
    }
  }
}

export {Keyboard};
