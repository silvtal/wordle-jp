import {LetterState, LetterInfo, Gamestate} from "./gamestate.js";
import {History} from "./history.js";
import {Warning} from "./warning.js";
import {Keyboard} from "./keyboard.js";
import {Grid} from  "./grid.js";
import {Words} from "./words.js";

let theApp;
let theHistory;
let theWords;

document.addEventListener('DOMContentLoaded', () => {
  theWords = new Words();
  theHistory = new History();
  theApp = new App(true);
});

// Words in arrays only
// Persist history

class App {
  constructor(testing) {
    this.gamestate = null;
    if (testing) this.initForTest();
    else this.initFromHistory();

    this.warning = new Warning(document.getElementsByTagName("aside")[0]);
    this.keyboard = new Keyboard(document.getElementById("keyboard"), this.gamestate);
    this.grid = new Grid(document.getElementById("grid"), this.gamestate);
    this.keyboard.onLetter(e => this.onLetter(e));
    this.keyboard.onBack(e => this.onBack());
    this.keyboard.onEnter(e => this.onEnter());
    this.gamestate.onGamestateChanged(() => this.onGamestateChanged());

    this.initPopup();
  }

  initPopup() {
    let elmPopup = document.getElementsByTagName("article")[0];
    document.getElementById("showInfo").addEventListener("click", () => {
      elmPopup.querySelector("#infoPopup").classList.add("visible");
      elmPopup.classList.add("visible");
    });
    elmPopup.addEventListener("click", (e) => {
      if (e.target.tagName != "BUTTON" || !e.target.classList.contains("close")) return;
      let elmSections = elmPopup.querySelectorAll("section");
      elmSections.forEach(elm => elm.classList.remove("visible"));
      elmPopup.classList.remove("visible");
      if (this.countdownIntervalId) {
        clearInterval(this.countdownIntervalId);
        this.countdownIntervalId = null;
      }
    });
  }

  showStatus(solved) {
    let elmPopup = document.getElementsByTagName("article")[0];

    let elmStatusMsg = document.getElementById("statusMsg");
    let elmTimeLeft = document.getElementById("timeLeft");
    let day = 7;
    if (solved) elmStatusMsg.innerText = `A ${day}. napi rejtvényt megfejtetted!`;
    else elmStatusMsg.innerText = `A ${day}. napi rejtvény nem jött össze :(`;
    elmPopup.querySelector("#statusPopup").classList.add("visible");
    elmPopup.classList.add("visible");

    let nextDate = theHistory.nextGameDate();
    this.countdownIntervalId = setInterval(() => {
      let dateNow = new Date();
      var seconds = Math.floor((nextDate - (dateNow)) / 1000);
      var minutes = Math.floor(seconds / 60);
      var hours = Math.floor(minutes / 60);
      var days = Math.floor(hours / 24);
      hours = hours - (days * 24);
      minutes = minutes - (days * 24 * 60) - (hours * 60);
      seconds = seconds - (days * 24 * 60 * 60) - (hours * 60 * 60) - (minutes * 60);
      hours = String(hours).padStart(2, "0");
      minutes = String(minutes).padStart(2, "0");
      seconds = String(seconds).padStart(2, "0");
      elmTimeLeft.innerText = `${hours}​:${minutes}​:${seconds}`;
    }, 50);
  }

  onGamestateChanged() {
    this.keyboard.updateView();
    this.grid.updateView();
  }

  onEnter() {
    let activeWord = this.gamestate.getActiveWord();
    if (activeWord == null) return;
    if (activeWord.length < 5) {
      this.warning.show("Kevés betű");
      return;
    }
    if (!theWords.isAcceptableWord(activeWord)) {
      this.warning.show("Ismeretlen szó");
      return;
    }
    this.gamestate.commitWord();
    if (this.gamestate.isFinished()) {
      if (!this.gamestate.isSolved()) {
        this.warning.show("Bukta");
        return;
      }
      else {
        this.showStatus(true);
      }
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
    this.gamestate = new Gamestate(theWords.getPuzzleWord(theHistory.dayIndex()));
    // this.gamestate.rows[0] = "karéj";
    // this.gamestate.rows.push("habar");
    // this.gamestate.rows.push("lehet");
    // this.gamestate.rows.push("telex");
    // this.gamestate.rows.push("butus");
    // this.gamestate.rows.push("boto");
    // this.gamestate.finishedRows = 5;
  }

  initFromHistory() {
    // theHistory.dayIndex()
  }
}
