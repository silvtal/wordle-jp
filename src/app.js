import {LetterState, LetterInfo, Gamestate} from "./gamestate.js";
import {Warning} from "./warning.js";
import {Keyboard} from "./keyboard.js";
import {Grid} from  "./grid.js";
import {Words} from "./words.js";

let theApp;
let theWords;

document.addEventListener('DOMContentLoaded', () => {
  theWords = new Words();
  theApp = new App(true);
});


class App {
  constructor(testing) {
    this.gamestate = null;
    if (testing) {
      this.initForTest();
    }
    this.warning = new Warning(document.getElementsByTagName("aside")[0]);
    this.keyboard = new Keyboard(document.getElementById("keyboard"), this.gamestate);
    this.grid = new Grid(document.getElementById("grid"), this.gamestate);
    this.keyboard.onLetter(e => this.onLetter(e));
    this.keyboard.onBack(e => this.onBack());
    this.keyboard.onEnter(e => this.onEnter());
    this.gamestate.onGamestateChanged(() => this.onGamestateChanged());
  }

  onGamestateChanged() {
    this.keyboard.updateView();
    this.grid.updateView();
  }

  onEnter() {
    let activeWord = this.gamestate.getActiveWord();
    if (activeWord == null) return;
    if (activeWord.length < 5) {
      this.warning.show("Nincs elég betű");
      return;
    }
    if (!theWords.isAcceptableWord(activeWord)) {
      this.warning.show("Nem ismerek ilyen szót :(");
      return;
    }
    this.gamestate.commitWord();
    if (this.gamestate.isFinished() && !this.gamestate.isSolved()) {
      this.warning.show("Bukta :(");
      return;
    }
  }

  onBack() {
    let activeWord = this.gamestate.getActiveWord();
    if (activeWord == null) return;
    if (activeWord.length == 0) return;
    this.gamestate.removeLetter();
  }

  onLetter(e) {
    let activeWord = this.gamestate.getActiveWord();
    if (activeWord == null) return;
    if (activeWord.length >= 5) return;
    this.gamestate.addLetter(e.detail);
  }

  initForTest() {
    this.gamestate = new Gamestate(theWords.getPuzzleWord(0));
    this.gamestate.rows[0] = "karéj";
    this.gamestate.rows.push("h");
    this.gamestate.finishedRows = 1;
  }
}
