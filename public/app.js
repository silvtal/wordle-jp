(() => {
  // src/settings.js
  var DisplayMode = {
    Light: "light",
    Dark: "dark"
  };
  var ColorScheme = {
    RedGreen: "red-green",
    BlueOrange: "blue-orange"
  };
  var Settings = class {
    constructor() {
      this.displayMode = DisplayMode.Light;
      if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches)
        this.displayMode = DisplayMode.Dark;
      this.colorScheme = ColorScheme.RedGreen;
      this.stgs = {};
      let stgsStored = localStorage.getItem("settings");
      if (stgsStored) {
        this.stgs = JSON.parse(stgsStored);
        if (this.stgs.displayMode)
          this.displayMode = this.stgs.displayMode;
        if (this.stgs.colorScheme)
          this.colorScheme = this.stgs.colorScheme;
      }
    }
    saveStgs() {
      localStorage.setItem("settings", JSON.stringify(this.stgs));
    }
    getDisplayMode() {
      return this.displayMode;
    }
    getColorScheme() {
      return this.colorScheme;
    }
    setDisplayMode(displayMode) {
      this.displayMode = displayMode;
      this.stgs.displayMode = displayMode;
      this.saveStgs();
    }
    setColorScheme(colorScheme) {
      this.colorScheme = colorScheme;
      this.stgs.colorScheme = colorScheme;
      this.saveStgs();
    }
  };

  // src/reloader.js
  var lastReloadCheckKey = "lastReloadCheck";
  var hashesUrl = "version.html";
  var minWaitMinutes = 60;
  var Reloader = class {
    constructor() {
      this.lastChecked = null;
      let lastCheckedStr = localStorage.getItem(lastReloadCheckKey);
      try {
        this.lastChecked = Date.parse(lastCheckedStr);
      } catch {
      }
      this.combinedHash = null;
      let reHash = new RegExp("\\?v=(.+)$");
      let elmAppScript = document.getElementById("app-js");
      let m = reHash.exec(elmAppScript.src);
      if (m)
        this.combinedHash = m[1];
      let elmLinkCss = document.getElementById("app-css");
      m = reHash.exec(elmLinkCss.href);
      if (m && this.combinedHash != null)
        this.combinedHash += "\n" + m[1];
      this.checkHash();
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible")
          this.checkHash();
      });
    }
    async checkHash() {
      if (this.combinedHash == null)
        return;
      if (this.lastChecked != null) {
        let minutes = (new Date() - this.lastChecked) / 1e3 / 60;
        if (minutes < minWaitMinutes)
          return;
      }
      this.lastChecked = new Date();
      localStorage.setItem(lastReloadCheckKey, this.lastChecked.toString());
      let resp = await fetch(hashesUrl, { cache: "no-store" });
      if (!resp.ok)
        return;
      let onlineHash = await resp.text();
      if (onlineHash.length != 65)
        return;
      if (onlineHash == this.combinedHash)
        return;
      location.reload();
    }
  };

  // src/gamestate.js
  var LetterState = {
    UnusedLetter: "unused",
    WrongLetter: "bad",
    WrongPlace: "wrongPlace",
    RightPlace: "good"
  };
  var LetterInfo = class {
    constructor(letter, state) {
      this.letter = letter;
      this.state = state;
    }
  };
  var totalRowCount = 6;
  var Gamestate = class {
    constructor(dayIx, solution) {
      this.dayIx = dayIx;
      this.solution = solution;
      this.rows = [""];
      this.finishedRows = 0;
      this.init();
    }
    init() {
      this.eventTarget = new EventTarget();
      this.slnLetterCounts = new Map();
      for (let i = 0; i < this.solution.length; ++i) {
        let letter = this.solution[i];
        let count = 0;
        if (this.slnLetterCounts.has(letter))
          count = this.slnLetterCounts.get(letter);
        count++;
        this.slnLetterCounts.set(letter, count);
      }
    }
    isSolved() {
      if (this.finishedRows == 0)
        return false;
      let word = this.rows[this.finishedRows - 1];
      return word == this.solution;
    }
    isFinished() {
      if (this.finishedRows == this.rows.length)
        return true;
      if (this.isSolved())
        return true;
      return false;
    }
    onGamestateChanged(handler) {
      this.eventTarget.addEventListener("gamestateChanged", handler);
    }
    removeLetter(letter) {
      if (this.isFinished())
        throw "cannot remove letter in finished game";
      let word = this.rows[this.finishedRows];
      if (word.length == 0)
        throw "row is already empty";
      this.rows[this.finishedRows] = word.substr(0, word.length - 1);
      this.eventTarget.dispatchEvent(new Event("gamestateChanged"));
    }
    commitWord() {
      if (this.isFinished())
        throw "cannot commit word in finished game";
      let word = this.rows[this.finishedRows];
      if (word.length != 5)
        throw "cannot commit word that does not have 5 characters";
      ++this.finishedRows;
      if (this.rows.length < totalRowCount)
        this.rows.push("");
      this.eventTarget.dispatchEvent(new Event("gamestateChanged"));
    }
    addLetter(letter) {
      if (this.isFinished())
        throw "cannot add letter to finished game";
      if (this.rows[this.finishedRows].length == 5)
        throw "row is already full";
      this.rows[this.finishedRows] += letter;
      this.eventTarget.dispatchEvent(new Event("gamestateChanged"));
    }
    getActiveWord() {
      if (this.isFinished())
        return null;
      return this.rows[this.finishedRows];
    }
    getMarkedLetters() {
      let letterStats = new Map();
      for (let i = 0; i < this.finishedRows; ++i) {
        let word = this.rows[i];
        for (let j = 0; j < word.length; ++j) {
          let letter = word[j];
          let kbdLetterInfo;
          if (letterStats.has(letter))
            kbdLetterInfo = letterStats.get(letter);
          else {
            kbdLetterInfo = new LetterStat();
            letterStats.set(letter, kbdLetterInfo);
          }
          if (this.solution[j] == word[j])
            kbdLetterInfo.addRightIx(j);
        }
      }
      let res = new Map();
      letterStats.forEach((stat, letter) => {
        if (!this.slnLetterCounts.has(letter))
          res.set(letter, LetterState.WrongLetter);
        else if (stat.rightIxs.length < this.slnLetterCounts.get(letter))
          res.set(letter, LetterState.WrongPlace);
        else
          res.set(letter, LetterState.RightPlace);
      });
      return res;
    }
    getFinishedRow(ix) {
      let word = this.rows[ix];
      let res = [];
      for (let pos = 0; pos < word.length; ++pos) {
        let guessLetter = word[pos];
        let letterState = LetterState.WrongLetter;
        if (this.solution[pos] == guessLetter)
          letterState = LetterState.RightPlace;
        else if (this.solution.indexOf(guessLetter) != -1) {
          let countInSolution = 0;
          if (this.slnLetterCounts.has(guessLetter))
            countInSolution = this.slnLetterCounts.get(guessLetter);
          let totalCorrectInGuess = 0;
          let wrongCountInGuessBefore = 0;
          for (let i = 0; i < this.solution.length; ++i) {
            if (i < pos && word[i] == guessLetter && this.solution[i] != guessLetter)
              ++wrongCountInGuessBefore;
            if (word[i] == guessLetter && word[i] == this.solution[i])
              ++totalCorrectInGuess;
          }
          if (wrongCountInGuessBefore + totalCorrectInGuess >= countInSolution)
            letterState = LetterState.WrongLetter;
          else
            letterState = LetterState.WrongPlace;
        }
        res.push(new LetterInfo(guessLetter, letterState));
      }
      return res;
    }
    getShareText(darkMode, contrastColors) {
      let rowInfos = [];
      for (let i = 0; i < this.finishedRows; ++i) {
        rowInfos.push(this.getFinishedRow(i));
      }
      let res = "";
      for (const ri of rowInfos) {
        if (res.length > 0)
          res += "\n";
        let first = true;
        for (const li of ri) {
          if (!first)
            res += "\u200A";
          first = false;
          if (li.state == LetterState.WrongLetter)
            res += darkMode ? "\u2B1B" : "\u2B1C";
          else if (li.state == LetterState.WrongPlace)
            res += contrastColors ? "\u{1F7E6}" : "\u{1F7E5}";
          else if (li.state == LetterState.RightPlace)
            res += contrastColors ? "\u{1F7E7}" : "\u{1F7E9}";
        }
      }
      return res;
    }
  };
  var LetterStat = class {
    constructor() {
      this.rightIxs = [];
    }
    addRightIx(ix) {
      if (this.rightIxs.includes(ix))
        return;
      this.rightIxs.push(ix);
      this.rightIxs.sort((a, b) => a - b);
    }
  };

  // node_modules/date-fns/esm/_lib/toInteger/index.js
  function toInteger(dirtyNumber) {
    if (dirtyNumber === null || dirtyNumber === true || dirtyNumber === false) {
      return NaN;
    }
    var number = Number(dirtyNumber);
    if (isNaN(number)) {
      return number;
    }
    return number < 0 ? Math.ceil(number) : Math.floor(number);
  }

  // node_modules/date-fns/esm/_lib/requiredArgs/index.js
  function requiredArgs(required, args) {
    if (args.length < required) {
      throw new TypeError(required + " argument" + (required > 1 ? "s" : "") + " required, but only " + args.length + " present");
    }
  }

  // node_modules/date-fns/esm/toDate/index.js
  function toDate(argument) {
    requiredArgs(1, arguments);
    var argStr = Object.prototype.toString.call(argument);
    if (argument instanceof Date || typeof argument === "object" && argStr === "[object Date]") {
      return new Date(argument.getTime());
    } else if (typeof argument === "number" || argStr === "[object Number]") {
      return new Date(argument);
    } else {
      if ((typeof argument === "string" || argStr === "[object String]") && typeof console !== "undefined") {
        console.warn("Starting with v2.0.0-beta.1 date-fns doesn't accept strings as date arguments. Please use `parseISO` to parse strings. See: https://git.io/fjule");
        console.warn(new Error().stack);
      }
      return new Date(NaN);
    }
  }

  // node_modules/date-fns/esm/addDays/index.js
  function addDays(dirtyDate, dirtyAmount) {
    requiredArgs(2, arguments);
    var date = toDate(dirtyDate);
    var amount = toInteger(dirtyAmount);
    if (isNaN(amount)) {
      return new Date(NaN);
    }
    if (!amount) {
      return date;
    }
    date.setDate(date.getDate() + amount);
    return date;
  }

  // node_modules/date-fns/esm/_lib/getTimezoneOffsetInMilliseconds/index.js
  function getTimezoneOffsetInMilliseconds(date) {
    var utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds()));
    utcDate.setUTCFullYear(date.getFullYear());
    return date.getTime() - utcDate.getTime();
  }

  // node_modules/date-fns/esm/startOfDay/index.js
  function startOfDay(dirtyDate) {
    requiredArgs(1, arguments);
    var date = toDate(dirtyDate);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  // node_modules/date-fns/esm/differenceInCalendarDays/index.js
  var MILLISECONDS_IN_DAY = 864e5;
  function differenceInCalendarDays(dirtyDateLeft, dirtyDateRight) {
    requiredArgs(2, arguments);
    var startOfDayLeft = startOfDay(dirtyDateLeft);
    var startOfDayRight = startOfDay(dirtyDateRight);
    var timestampLeft = startOfDayLeft.getTime() - getTimezoneOffsetInMilliseconds(startOfDayLeft);
    var timestampRight = startOfDayRight.getTime() - getTimezoneOffsetInMilliseconds(startOfDayRight);
    return Math.round((timestampLeft - timestampRight) / MILLISECONDS_IN_DAY);
  }

  // node_modules/date-fns/esm/differenceInDays/index.js
  function compareLocalAsc(dateLeft, dateRight) {
    var diff = dateLeft.getFullYear() - dateRight.getFullYear() || dateLeft.getMonth() - dateRight.getMonth() || dateLeft.getDate() - dateRight.getDate() || dateLeft.getHours() - dateRight.getHours() || dateLeft.getMinutes() - dateRight.getMinutes() || dateLeft.getSeconds() - dateRight.getSeconds() || dateLeft.getMilliseconds() - dateRight.getMilliseconds();
    if (diff < 0) {
      return -1;
    } else if (diff > 0) {
      return 1;
    } else {
      return diff;
    }
  }
  function differenceInDays(dirtyDateLeft, dirtyDateRight) {
    requiredArgs(2, arguments);
    var dateLeft = toDate(dirtyDateLeft);
    var dateRight = toDate(dirtyDateRight);
    var sign = compareLocalAsc(dateLeft, dateRight);
    var difference = Math.abs(differenceInCalendarDays(dateLeft, dateRight));
    dateLeft.setDate(dateLeft.getDate() - sign * difference);
    var isLastDayNotFull = Number(compareLocalAsc(dateLeft, dateRight) === -sign);
    var result = sign * (difference - isLastDayNotFull);
    return result === 0 ? 0 : result;
  }

  // words/words.js
  var puzzleWords = [
    "uwwwu",
    "pobkj",
    "spufo",
    "njutv",
    "jttvj",
    "tbvkj",
    "cvcvo",
    "nvspo",
    "lpubf",
    "kvokp",
    "ifjxb",
    "ljonf",
    "gjuup",
    "ubofo",
    "npspj",
    "joipo",
    "sbeep",
    "vnbsf",
    "lzpvj",
    "ibqvo",
    "lflbo",
    "potfj",
    "lpubj",
    "ubocj",
    "tbolb",
    "lbjhj",
    "njcbf",
    "tvfhv",
    "bpspv",
    "jbogv",
    "voufo",
    "tfonv",
    "zbohv",
    "sfo{v",
    "zbtfj",
    "tbjnv",
    "tvjcj",
    "gvlbj",
    "lvsvj",
    "hblpv",
    "pibjp",
    "ljdij",
    "ofhbv",
    "tfjlj",
    "hbjij",
    "hzblv",
    "bjobj",
    "upvij",
    "nfjep",
    "npolv",
    "ljnpo",
    "sbejp",
    "gvifo",
    "plvsj",
    "nvkvo",
    "lvtij",
    "hbotp",
    "lbsfj",
    "lptvj",
    "efoqb",
    "tiblv",
    "ljufo",
    "qjqjo",
    "ijspv",
    "gvlbo",
    "tpvsj",
    "ubjsb",
    "cbuup",
    "kjtiv",
    "ljlpv",
    "kjlbo",
    "tbjlj",
    "dijfo",
    "lbjtp",
    "hjlpv",
    "lvspv",
    "joubj",
    "hbnbo",
    "fjnfj",
    "nbocp",
    "oflbo",
    "sbjij",
    "ij{pv",
    "pibsb",
    "lfolb",
    "cptfj",
    "bhfub",
    "ojhpo",
    "tpvtb",
    "jublv",
    "btfsv",
    "ojuup",
    "qfjkj",
    "pzpcv",
    "eflbj",
    "lvnfo",
    "ufolj",
    "{bcpo",
    "lpvlb",
    "zblfj",
    "ibzbj",
    "ljtij",
    "objcv",
    "tbtbf",
    "tbjhp",
    "pvebo",
    "hpvlj",
    "qpoep",
    "ubf{v",
    "eblbj",
    "jbutv",
    "ljtvj",
    "ufoqv",
    "tfnbj",
    "tpvpv",
    "ebcpv",
    "lbebj",
    "izvnv",
    "ufibj",
    "tvjlp",
    "diplv",
    "ljhpv",
    "lbnbv",
    "vudij",
    "sbkjp",
    "ijobo",
    "gvuup",
    "tfo{p",
    "zvvcj",
    "utvnj",
    "tivsb",
    "cvutv",
    "tijlj",
    "bocbj",
    "hphbo",
    "jotij",
    "tbnpo",
    "cvozb",
    "ojqqb",
    "xbllb",
    "svoep",
    "ibjcv",
    "obffj",
    "tbocj",
    "ifolb",
    "lpvvo",
    "lb{vp",
    "uponb",
    "lpvtb",
    "lbjij",
    "hbqqj",
    "jcpnf",
    "cpvkv",
    "ojgvo",
    "lfjcj",
    "gvubo",
    "{pllb",
    "nftib",
    "kjzvv",
    "lbkvv",
    "lzplf",
    "ofcpv",
    "kjubj",
    "jfkvv",
    "zpuuf",
    "lbjcb",
    "efbsv",
    "cvolb",
    "zpvhp",
    "lfbob",
    "sboeb",
    "ibzbv",
    "ljtbj",
    "gbjcb",
    "gvlpv",
    "utvlj",
    "jnfkj",
    "lbllp",
    "uptpv",
    "bnjsv",
    "tfjup",
    "ljuuf",
    "ptpsf",
    "ublfj",
    "ubtij",
    "jdijj",
    "ljtiv",
    "qbtib",
    "uflbo",
    "uflfo",
    "cvocp",
    "bufnp",
    "bjtfj",
    "fj{pv",
    "joxbj",
    "lbufo",
    "ebolp",
    "focvo",
    "lbotb",
    "lfokj",
    "vnflv",
    "hbllv",
    "ufohj",
    "npoup",
    "tvjfj",
    "ljutv",
    "kjtpv",
    "qfuup",
    "tfutv",
    "lpnbj",
    "cpvup",
    "lbubo",
    "sjspo",
    "ibjlj",
    "tpveb",
    "nbipv",
    "jlpnj",
    "lvdij",
    "cvoqv",
    "ibblv",
    "ibvsb",
    "ibolf",
    "bcvsb",
    "nfjkj",
    "ptvsv",
    "nvtij",
    "pupnf",
    "vsplp",
    "sbonp",
    "qbogv",
    "tptfj",
    "cfjcj",
    "cbsjb",
    "lpllv",
    "lpvkj",
    "hp{fo",
    "tvqqb",
    "cfokp",
    "upttb",
    "szblv",
    "ubtvv",
    "uplvj",
    "zpxbj",
    "zpnfp",
    "ijlpv",
    "plptv",
    "lbuup",
    "epv{p",
    "bnjep",
    "lbupv",
    "pvsfo",
    "ijepj",
    "qbozb",
    "gvopv",
    "ipfsv",
    "cptvv",
    "fuptv",
    "gvtij",
    "vhplv",
    "pcblf",
    "plbhf",
    "ovlvj",
    "lbebo",
    "tiplj",
    "gvspb",
    "{bjlb",
    "ubcfo",
    "gvtfj",
    "tvlpo",
    "blb{b",
    "gvcjo",
    "ipvgv",
    "lbubj",
    "sbqqb",
    "nfjsp",
    "tijub",
    "nfozv",
    "cjzpo",
    "lzplb",
    "vsjlp",
    "lbtbj",
    "jsfsv",
    "tfocv",
    "dibib",
    "iblfo",
    "lbjlj",
    "lpvjo",
    "obfhj",
    "bttfj",
    "lbokp",
    "zpvtv",
    "lpvsb",
    "pvupv",
    "lbjsj",
    "ubptv",
    "ljcpv",
    "lpljo",
    "ptbkj",
    "ubjxb",
    "utvnv",
    "bofsv",
    "ljfuf",
    "hpibo",
    "zpvpo",
    "hzbsv",
    "kvocj",
    "pxbsv",
    "{pvzp",
    "ubohp",
    "utvsv",
    "ojdij",
    "psjsv",
    "tbipv",
    "lptfj",
    "lblpj",
    "opspj",
    "gvjup",
    "ipvsv",
    "cpohv",
    "hptbo",
    "utvnf",
    "gvipv",
    "tpvlp",
    "ubutv",
    "nzblv",
    "vtfsv",
    "nbutv",
    "tvhpj",
    "kpipv",
    "lblpv",
    "zbzvv",
    "ebcbo",
    "vfupv",
    "ipsvj",
    "gvsvj",
    "cjolb",
    "zpcvo",
    "npbsf",
    "pkbnb",
    "vljnf",
    "tbjlb",
    "ibjub",
    "njebj",
    "jolbo",
    "tbocb",
    "puptv",
    "upsjp",
    "fjlpv",
    "tfjlb",
    "lbjqb",
    "hjlbj",
    "lpolj",
    "gvlfj",
    "lbfsv",
    "gvkvo",
    "ljibo",
    "bubsv",
    "cboep",
    "cfohj",
    "vxbtb",
    "sjlpv",
    "svspv",
    "tipkj",
    "ljlbj",
    "jfsfj",
    "ipooj",
    "{bipo",
    "divcv",
    "kvotb",
    "tpipv",
    "dijlv",
    "epvlj",
    "lvvij",
    "tibsf",
    "sboqj",
    "diptb",
    "tplvj",
    "ljokp",
    "qpqqp",
    "cvobo",
    "lboqb",
    "ljhfo",
    "cputv",
    "npveb",
    "ubooj",
    "cvsfj",
    "lpvtp",
    "joupo",
    "ljzpv",
    "npdij",
    "qpfkj",
    "gvufj",
    "obocb",
    "tfubj",
    "lvjlj",
    "jotbo",
    "lvllj",
    "gbsjb",
    "divvj",
    "sfutv",
    "gvupv",
    "ipvlb",
    "ubolb",
    "opllv",
    "nbnpv",
    "zvvoj",
    "poupv",
    "upvlj",
    "kjfsj",
    "tpvxb",
    "lpllb",
    "vlbup",
    "sjqfb",
    "tbubo",
    "fokpj",
    "nbjsv",
    "jlzpv",
    "lbcjo",
    "ubolj",
    "upuup",
    "xbsvj",
    "ljlfo",
    "tphbj",
    "ojcbo",
    "kvutv",
    "spvtp",
    "vlbcv",
    "spvnv",
    "pnpuf",
    "kp{bo",
    "tpnfj",
    "{vlfj",
    "tblbj",
    "ifjpo",
    "zpdij",
    "bufsv",
    "tponv",
    "zvvhv",
    "plvep",
    "hvuup",
    "utvlb",
    "{pvtb",
    "tvjtp",
    "ebupv",
    "dijsj",
    "cbjzb",
    "ifonf",
    "bhfsv",
    "hjnbo",
    "ljljo",
    "sfczv",
    "cbkpo",
    "lbsvj",
    "lpvfo",
    "gvubv",
    "tijkj",
    "hjonj",
    "ojtfj",
    "vo{bo",
    "jupnp",
    "ljufj",
    "dibnf",
    "jxbsf",
    "ijojo",
    "tbplp",
    "ijokj",
    "qjqqv",
    "ljopv",
    "tpvlj",
    "tfjfo",
    "pbtij",
    "iblbj",
    "tpvsv",
    "lvjsv",
    "efnpo",
    "cplfj",
    "boubj",
    "hvepo",
    "cbjuf",
    "ibnvv",
    "cpvzb",
    "gvsbo",
    "sfbsj",
    "nfdib",
    "ipllj",
    "nvgvv",
    "kpvkv",
    "cjnbo",
    "hfolb",
    "zpvjo",
    "sbjup",
    "bljsv",
    "tfolv",
    "ufbuf",
    "kjnbo",
    "spvij",
    "jspoj",
    "lpufo",
    "jozpv",
    "hbolp",
    "cbhfo",
    "ufbup",
    "lftij",
    "spvlv",
    "ubhpo",
    "hfspv",
    "lvlbo",
    "tbufj",
    "nbebo",
    "ijnfj",
    "zplfo",
    "hpzpv",
    "zpvgv",
    "lbhfo",
    "ljkvo",
    "kpvij",
    "ojokb",
    "tfhvf",
    "cvnbo",
    "bttbj",
    "tfjpo",
    "jllpv",
    "lpvlv",
    "nputv",
    "jjlbf",
    "nfjsv",
    "hfijo",
    "lzplv",
    "gvoov",
    "epvkj",
    "lbnpo",
    "tvvlj",
    "qfufo",
    "nvflj",
    "ljolp",
    "lfhfo",
    "gvsfj",
    "pijnb",
    "ebjov",
    "kjifo",
    "lfofo",
    "tpobf",
    "eplbo",
    "nb{vj",
    "ufoop",
    "joblb",
    "zpv{v",
    "tvkpv",
    "ojotp",
    "tbjib",
    "vjuup",
    "ufoip",
    "lzphj",
    "gvjlj",
    "upsjf",
    "ojllj",
    "foplj",
    "pokpv",
    "bjtpv",
    "nbkjo",
    "tpvcb",
    "foljo",
    "fotfj",
    "lbpsj",
    "lputv",
    "npipv",
    "gvljo",
    "pnblf",
    "jttpv",
    "jcblv",
    "ibtbo",
    "jiblv",
    "gvfsv",
    "bobub",
    "gvllj",
    "tbutv",
    "tpcpv",
    "gvupj",
    "nvcpv",
    "cpvnv",
    "ofplj",
    "pxbsj",
    "bjnbj",
    "zbupv",
    "jhbsv",
    "ibjtv",
    "nfjcp",
    "efcbo",
    "ljubo",
    "svocb",
    "lbjlp",
    "efokv",
    "lbjlb",
    "ljsfj",
    "cjlpv",
    "lpzvv",
    "lpzpv",
    "eboxb",
    "tpvhv",
    "gvllb",
    "fudij",
    "cpkpv",
    "lbosv",
    "ifjjo",
    "kjufo",
    "bsfgv",
    "ebosp",
    "ojhbj",
    "tboep",
    "ublpv",
    "svjlb",
    "ljlbo",
    "{vuup",
    "lfjlj",
    "nvlfj",
    "sfkjf",
    "upocp",
    "lzbqb",
    "lfotb",
    "ljifj",
    "lbosj",
    "juubo",
    "ufvtv",
    "nvjnj",
    "szvsj",
    "hjtfj",
    "hjifo",
    "fsjtv",
    "ojkpv",
    "bjhbo",
    "blbtv",
    "pjxbj",
    "bupqj",
    "ebjkj",
    "tptij",
    "cfotp",
    "njsfj",
    "cvozp",
    "utvup",
    "ubotp",
    "foszp",
    "lpvhj",
    "ubjnb",
    "dijnf",
    "zphfo",
    "ufnvv",
    "utvub",
    "ibllv",
    "ubdij",
    "hfolj",
    "{pvlb",
    "plljj",
    "ibdij",
    "kphfo",
    "bnbub",
    "gvvgv",
    "lvnpo",
    "tpufj",
    "lplbo",
    "psjbj",
    "peblv",
    "bjofo",
    "ifooj",
    "tijsv",
    "ebohj",
    "cjkjo",
    "lbptv",
    "lpflj",
    "spvsv",
    "ljlfj",
    "{fjlb",
    "vxbhj",
    "tvf{v",
    "jubnj",
    "tipsj",
    "ifeeb",
    "cjdij",
    "lplfj",
    "tfjbv",
    "dibkj",
    "cbjsv",
    "nvhpj",
    "lzpkj",
    "lbqqv",
    "kboqb",
    "tblbo",
    "sjzpo",
    "nfjcj",
    "bsbnv",
    "ojtvj",
    "hjcpo",
    "tipvj",
    "tijup",
    "efolb",
    "jgvlv",
    "pljsv",
    "juplp",
    "kpv{v",
    "ijoup",
    "hjebj",
    "bsbsf",
    "lbifj",
    "njlpv",
    "lpvuf",
    "jubsv",
    "sfokj",
    "lpqqv",
    "bsvlj",
    "nfjhj",
    "lfjcb",
    "bkbsv",
    "lfjfj",
    "hbvtv",
    "zbtij",
    "sjqqj",
    "ubjhp",
    "efocv",
    "lbolj",
    "nbttf",
    "kjoub",
    "kbosv",
    "obolb",
    "epvjo",
    "upqqb",
    "hvlpv",
    "pibob",
    "lbotp",
    "ubtbj",
    "nbotv",
    "jobnv",
    "lfosv",
    "tbjgv",
    "tijoj",
    "vobhj",
    "ifosj",
    "ojolb",
    "ojpcf",
    "jdipv",
    "lbftv",
    "dij{v",
    "gvnpv",
    "zpzvv",
    "upvib",
    "npebo",
    "ppljj",
    "lpvzb",
    "pofhb",
    "svqjb",
    "utvob",
    "nfocb",
    "jokpv",
    "lptib",
    "xbuup",
    "nbocb",
    "iptfj",
    "vefxb",
    "gvhpv",
    "{bqqv",
    "dijgv",
    "kvvtv",
    "gvvib",
    "ufjtv",
    "ipozb",
    "npuuf",
    "lbonv",
    "tvjgv",
    "tfjtv",
    "kjllb",
    "lpxbj",
    "lfjsp",
    "ljtfj",
    "hjufo",
    "ebolv",
    "tijsb",
    "fnpop",
    "hpcpv",
    "fgvef",
    "cbtib",
    "kbblv",
    "bubnb",
    "gvnfj",
    "pnpoj",
    "jsflf",
    "cpubj",
    "tijep",
    "jljlj",
    "hfosj",
    "voepv",
    "spoqb",
    "ijspj",
    "gbjup",
    "lvvtp",
    "lbuub",
    "zvsbj",
    "tijnb",
    "ubjeb",
    "lbocv",
    "diflp",
    "zvvfo",
    "{folb",
    "hb{pv",
    "jpolb",
    "ipopp",
    "ebubj",
    "ebvjo",
    "ifutv",
    "ijlvj",
    "lpvhp",
    "spvfj",
    "zpcbv",
    "jlbsj",
    "ufjlb",
    "kptij",
    "vofsv",
    "tijnj",
    "qfjqb",
    "hjtip",
    "njoup",
    "hfebo",
    "ljtpo",
    "sbllv",
    "tbsbf",
    "uboeb",
    "uptij",
    "pzbkj",
    "tvjsp",
    "pohvv",
    "tibqv",
    "fhblv",
    "ibonj",
    "tbtij",
    "lbnfj",
    "efoxb",
    "lbtij",
    "ijcvo",
    "lbcbv",
    "upvub",
    "bxbsf",
    "zpvup",
    "jubtv",
    "tijlb",
    "lbhbj",
    "cvosj",
    "jlf{v",
    "qjnbo",
    "cbolb",
    "nvhpo",
    "kpcvo",
    "tbtpv",
    "ufbsb",
    "zvvlj",
    "opvlv",
    "sjlbj",
    "zpvlj",
    "cvolj",
    "j{fsv",
    "ubpsv",
    "cpvsv",
    "jepnv",
    "upozb",
    "hfoep",
    "ijsvj",
    "pokvo",
    "njoxb",
    "ljsbv",
    "poblb",
    "cfo{b",
    "lbfsj",
    "tbjcv",
    "kjtip",
    "ubjlb",
    "johjo",
    "pubnb",
    "ubzpv",
    "joflp",
    "spvlb",
    "lboxb",
    "ublbj",
    "jovkv",
    "tbzpv",
    "epsbj",
    "hjkjo",
    "hpohf",
    "tbjsj",
    "ijnfo",
    "opvnv",
    "psvnv",
    "bnjlj",
    "ljolj",
    "pkjhj",
    "butvj",
    "ufoxb",
    "tvobp",
    "lbspv",
    "lbonb",
    "cpifj",
    "pcfcf",
    "tblfo",
    "lpvxb",
    "fkjlj",
    "cbo{v",
    "ipvbo",
    "lponf",
    "kjeeb",
    "sjolj",
    "ijflj",
    "lj{bj",
    "sbohv",
    "tfjkp",
    "dipvj",
    "lpvlf",
    "ofllj",
    "ibjnv",
    "kpvup",
    "jlpup",
    "lpuub",
    "vsbnj",
    "lbtpv",
    "ibnpo",
    "utvlv",
    "tiptv",
    "po{po",
    "njjsv",
    "ifcjj",
    "dijqv",
    "lpvlj",
    "njufj",
    "lbsbo",
    "cpvfj",
    "tfokp",
    "tfuup",
    "cjlbp",
    "jzblj",
    "ljepv",
    "jfepv",
    "zpspo",
    "jtipv",
    "hvsjp",
    "jovlb",
    "tblvj",
    "lbtfj",
    "sjotv",
    "ufoqp",
    "vjohv",
    "jflzp",
    "jokvo",
    "lbzpv",
    "ebolj",
    "zvebo",
    "sfnpo",
    "bttiv",
    "qfllv",
    "{bokj",
    "focbo",
    "gvzpv",
    "ubfnb",
    "hpipo",
    "lbhpv",
    "tbokj",
    "kpvhj",
    "nvkpv",
    "cjeep",
    "lpkpv",
    "gvllv",
    "zpvkj",
    "ifjtb",
    "pkjvf",
    "nptib",
    "hptpv",
    "ifcvo",
    "qbjqv",
    "tbllb",
    "hjbob",
    "fjdij",
    "spllv",
    "ubfsv",
    "tfolb",
    "jfsbj",
    "ozvnv",
    "zvtpv",
    "divob",
    "lfjlv",
    "ljuup",
    "jllfo",
    "tfpsj",
    "opvlb",
    "gvpcj",
    "ebjfo",
    "ijjsp",
    "tptfo",
    "lb{pv",
    "fcjtv",
    "ibtij",
    "cfutv",
    "tpspf",
    "lbnfo",
    "ubjij",
    "zvvnf",
    "lbocj",
    "ibotp",
    "bcjsv",
    "tvqjb",
    "lbfef",
    "kpspv",
    "tfoub",
    "vzplv",
    "ibsbj",
    "boobj",
    "cvnpo",
    "hpuub",
    "folpo",
    "spvtv",
    "ofufj",
    "fjcjo",
    "lfocv",
    "tijfo",
    "tivhp",
    "spvsj",
    "tfotb",
    "zpvhv",
    "boufj",
    "ijufj",
    "hbojo",
    "nzvsb",
    "epsfj",
    "kjhbj",
    "kpvgv",
    "lptij",
    "jjzpv",
    "ijnbo",
    "sjkpo",
    "lbufj",
    "uplfo",
    "tivup",
    "obhbj",
    "ibolp",
    "foqfj",
    "ifonv",
    "kjebj",
    "tftiv",
    "nfibj",
    "nv{bo",
    "tpvpo",
    "cbupo",
    "pvzpv",
    "tfjzv",
    "ifotb",
    "lpcvo",
    "{vibo",
    "lfllj",
    "bsbuf",
    "ofoqv",
    "tiplv",
    "bjtbo",
    "ubjnv",
    "kblpv",
    "ufjlv",
    "ljtpv",
    "kjkvv",
    "nflfo",
    "efjsj",
    "lp{pv",
    "joubo",
    "lpohp",
    "tbdij",
    "lvvsp",
    "jqqbj",
    "pljnf",
    "kplbj",
    "vlfbv",
    "cfjtv",
    "fhbsb",
    "bubsj",
    "cfolj",
    "ipqqv",
    "pzphv",
    "zpjlj",
    "hvspj",
    "ibsbv",
    "bzvnj",
    "tvfep",
    "cpllb",
    "lbonj",
    "tbejo",
    "ijkpv",
    "tbuup",
    "bnbnj",
    "lbnzv",
    "ijcpo",
    "phbxb",
    "njnbv",
    "njcvo",
    "sbttb",
    "gjdib",
    "gvzvv",
    "ljupo",
    "peplv",
    "tvlpb",
    "ibsbo",
    "hffnv",
    "cboqv",
    "ijepv",
    "ojonv",
    "nv{bj",
    "cpubo",
    "obptv",
    "kptfj",
    "spnfo",
    "lboep",
    "nvlpv",
    "bsvup",
    "flvcp",
    "tfjop",
    "ljfsv",
    "xbjep",
    "zbutv",
    "potib",
    "ppcbo",
    "ufjhp",
    "jljsv",
    "iplbo",
    "utvcv",
    "uboqp",
    "cvupv",
    "zpvtp",
    "hbjlb",
    "boibj",
    "lfj{v",
    "lvsjo",
    "lvsjb",
    "ijlbo",
    "pnplj",
    "hjhfj",
    "ubllv",
    "nbvtv",
    "ubebv",
    "jtflj",
    "lvpub",
    "hjibo",
    "upllj",
    "vxbcf",
    "lbepv",
    "ufzvv",
    "lvspj",
    "bzbnf",
    "tvnbv",
    "jzplv",
    "pnbtf",
    "nbgjb",
    "ipjsv",
    "ibttv",
    "nbgjo",
    "zpvsv",
    "efutv",
    "epvlb",
    "bjcpv",
    "lbuuf",
    "kvcbj",
    "kvhpv",
    "njdij",
    "tpebj",
    "lfllb",
    "tptpv",
    "p{vlf",
    "lzplj",
    "ib{vj",
    "tpllj",
    "tvjkj",
    "hpvtb",
    "szvkv",
    "ijibo",
    "nvtib",
    "efzvp",
    "zvvhj",
    "dibnv",
    "fsjlp",
    "ipokj",
    "polbj",
    "ljolv",
    "ibpsv",
    "hjtpv",
    "ljipo",
    "cbcpo",
    "fobkj",
    "lfjcp",
    "lbjuf",
    "puflj",
    "votij",
    "pocjo",
    "ebouf",
    "jzbtv",
    "plbhp",
    "fonbo",
    "hj{pv",
    "xbjsb",
    "ibotb",
    "zptpv",
    "ubnbv",
    "ipvlj",
    "hpipv",
    "bzbtv",
    "folbo",
    "epkjf",
    "utvof",
    "opdij",
    "ljobo",
    "obpsj",
    "fjtib",
    "gvkpv",
    "hvocj",
    "kpvlj",
    "tijbj",
    "tvjlb",
    "ojbhf",
    "ubjlj",
    "lbobv",
    "ebjsj",
    "btpcj",
    "ebjlv",
    "kpvnv",
    "sfopo",
    "fjufo",
    "biplf",
    "sbufo",
    "lbokb",
    "ofuup",
    "upvoj",
    "hb{fo",
    "kpvzp",
    "{bjjf",
    "sfblb",
    "psjnf",
    "upvzb",
    "ejpsv",
    "peflj",
    "nftij",
    "ubjkj",
    "vlfsv",
    "kpvcv",
    "nbtij",
    "ebnjo",
    "zvlbj",
    "nfjtv",
    "jopsv",
    "tbtbj",
    "lvutv",
    "tvupb",
    "kjokb",
    "lfoup",
    "upocj",
    "kbqqv",
    "kvvtb",
    "bo{fo",
    "hjnpv",
    "blvnb",
    "tijlp",
    "{vsvj",
    "cjspv",
    "qjsfb",
    "ibjgj",
    "bjlpv",
    "kvvzb",
    "{bolj",
    "ijllj",
    "iptiv",
    "hbjkj",
    "hbufo",
    "tvopv",
    "obpsv",
    "cjufo",
    "upvcv",
    "bjsfo",
    "lfjlb",
    "lboqv",
    "ljhbo",
    "ijtbj",
    "qzvnb",
    "nfotp",
    "ofhbj",
    "nbuup",
    "utvhv",
    "cpvcj",
    "nvtvv",
    "xbtij",
    "lblfj",
    "vfuup",
    "ipufj",
    "epspo",
    "nvtpv",
    "ifokj",
    "eftij",
    "fosfo",
    "gv{fo",
    "jzbfo",
    "lbllj",
    "tijzb",
    "xbhpv",
    "opufo",
    "plbtv",
    "ufjbo",
    "kvosj",
    "sbjub",
    "nfspo",
    "ibjfj",
    "qbufj",
    "cjbnf",
    "nfjvo",
    "gfbvf",
    "qbveb",
    "focpv",
    "spsfo",
    "tvjup",
    "fo{vj",
    "gvvhb",
    "nfnjf",
    "tipfo",
    "ptivv",
    "jlblv",
    "hvnbj",
    "kvvlb",
    "hvocb",
    "hbsjb",
    "zbtbj",
    "lvsbv",
    "ifeep",
    "voqbo",
    "ibjlp",
    "pgjtv",
    "jttij",
    "tvlvv",
    "bijsv",
    "zvvjo",
    "ljijo",
    "bhbsj",
    "lbolb",
    "fuplv",
    "npsbv",
    "zbxbj",
    "lzpij",
    "gbjsv",
    "ljspv",
    "bcvlv",
    "kpkjb",
    "gvvtb",
    "pubnv",
    "fotpv",
    "eblpv",
    "bsjsv",
    "jllbo",
    "gvofj",
    "upufj",
    "tfotv",
    "ijotp",
    "cvtvj",
    "lbjxb",
    "zptij",
    "lfjkj",
    "ijtvj",
    "bolpv",
    "lvopv",
    "tfjcv",
    "ijubj",
    "nfjzp",
    "ljupv",
    "hfuup",
    "sbpup",
    "ipuup",
    "lpgvv",
    "kjhhv",
    "ijxbj",
    "tbflj",
    "vjolv",
    "hjspo",
    "iboup",
    "ipolj",
    "ufjhj",
    "nvdib",
    "ubjzp",
    "kjhfo",
    "tpipo",
    "tvufj",
    "tf{po",
    "jsfcb",
    "gvojo",
    "pnpnj",
    "ofllp",
    "sfjsj",
    "ijoep",
    "zbcbo",
    "ebipv",
    "zptfj",
    "jubnf",
    "pp{fj",
    "npuup",
    "pepsv",
    "jubnp",
    "bljtv",
    "vkveb",
    "ofsbv",
    "ebllv",
    "ijjlj",
    "kjonp",
    "tpflj",
    "flpkj",
    "kjo{v",
    "jcvlj",
    "bptij",
    "npibo",
    "epkpv",
    "bjipo",
    "epjsj",
    "lbtfo",
    "ubllb",
    "hpvhp",
    "{vopv",
    "spnbo",
    "lpvep",
    "fonbj",
    "eboej",
    "cbllv",
    "efolj",
    "jtphj",
    "tfjep",
    "vxblj",
    "lbefo",
    "nvjlb",
    "ijkvo",
    "tpuup",
    "tbjeb",
    "ipvlp",
    "upv{b",
    "upqqj",
    "bllbo",
    "jtphv",
    "sjohj",
    "hpvhj",
    "ovhvv",
    "cvsvj",
    "nboqp",
    "zvvlv",
    "ljopo",
    "kbnbo",
    "cbggb",
    "diblv",
    "hvhfo",
    "sfjhj",
    "ljubj",
    "hpvnf",
    "zbupj",
    "hvtbj",
    "npolp",
    "lbjkj",
    "polpv",
    "cbutv",
    "npvlf",
    "kjtbo",
    "jnbzb",
    "hvvxb",
    "zptbo",
    "ibtib",
    "ljonb",
    "ibutv",
    "tfolf",
    "tpvkj",
    "diplp",
    "jqqfo",
    "zblbj",
    "ovjnf",
    "lpv{b",
    "tijjo",
    "tivvj",
    "sfjcv",
    "cvsbo",
    "{pvfo",
    "cpvhp",
    "plpsv",
    "lfjup",
    "foqpv",
    "jxbcb",
    "nbkjj",
    "njfsv",
    "judij",
    "xbkvo",
    "bsjtb",
    "ijipv",
    "juufo",
    "jlbeb",
    "sbjtb",
    "lpvfj",
    "fjtbj",
    "tptbj",
    "{buub",
    "vonfj",
    "sjolv",
    "ebjlb",
    "upvsv",
    "tibnp",
    "lbobo",
    "upspo",
    "np{pv",
    "kjtvv",
    "tputv",
    "tfsjo",
    "eptfj",
    "tpuuf",
    "lbjib",
    "spkkj",
    "tfuub",
    "psvgv",
    "lbnbf",
    "bjupv",
    "hvkvo",
    "ptijf",
    "zvohv",
    "vnblv",
    "zpvzb",
    "kjdij",
    "hjtij",
    "ipjlv",
    "upcjp",
    "bsbtb",
    "sjzvv",
    "kpvlb",
    "lfotv",
    "czvsp",
    "lbozp",
    "up{bo",
    "kjtfj",
    "diblp",
    "ljfub",
    "zpipv",
    "kpvnf",
    "kvosp",
    "bcvsv",
    "hjufj",
    "utvcb",
    "hfotp",
    "kpvfo",
    "lfosf",
    "cbolv",
    "ibjcj",
    "lfuup",
    "lpsbo",
    "hbuup",
    "lpoup",
    "foepv",
    "tijcb",
    "lppsv",
    "zpvkp",
    "kvfsj",
    "jtijo",
    "tpvhj",
    "tbo{v",
    "vfjup",
    "tbnvj",
    "hvolb",
    "npvhp",
    "ojllb",
    "njsbj",
    "dijsv",
    "kboqv",
    "qbsfo",
    "uflfj",
    "ibolj",
    "tfosb",
    "nv{vj",
    "plvsf",
    "gpspv",
    "nvofo",
    "poboj",
    "tpspv",
    "lpvkp",
    "nvzpv",
    "jsf{b",
    "ofsbj",
    "hfozb",
    "epvhb",
    "nf{po",
    "kvlfo",
    "nbibo",
    "ibqqb",
    "cpv{v",
    "ijlbf",
    "ip{po",
    "tvebo",
    "sbdib",
    "fljsj",
    "vubhf",
    "hjofo",
    "npzbj",
    "fejub",
    "npnfo",
    "jspbj",
    "lvpup",
    "tivlv",
    "ibepv",
    "tvjep",
    "pvcbj",
    "upvlb",
    "tijeb",
    "upupv",
    "hptfj",
    "ufohp",
    "hbhpv",
    "ibfsv",
    "tivhj",
    "lvcvo",
    "dijlj",
    "vhplj",
    "jnjbj",
    "ovcjb",
    "ljzpj",
    "fcbtv",
    "{vtij",
    "cfspb",
    "lvvlj",
    "kpjtv",
    "tibqp",
    "jolfo",
    "ufjkj",
    "ipvep",
    "lbtip",
    "fjtfj",
    "up{bj",
    "ebjgv",
    "gvolb",
    "ifjjf",
    "tpvlb",
    "tfjtb",
    "bqjsv",
    "pvsbj",
    "lbjsp",
    "dijzv",
    "diftv",
    "kjoeb",
    "psjbv",
    "tvqbo",
    "ipvkp",
    "vopnj",
    "jpoob",
    "sfjop",
    "boqfb",
    "jdivv",
    "jhbub",
    "ijtbo",
    "ijttv",
    "boqpv",
    "lvsbj",
    "tbjep",
    "hvtib",
    "jpojb",
    "ijubo",
    "lbtbo",
    "fjtpv",
    "{voup",
    "ifoib",
    "tijcv",
    "oboqb",
    "ljcvo",
    "epvhv",
    "nbfop",
    "ebifo",
    "ijefo",
    "hvnpv",
    "zvvtv",
    "tbcpv",
    "sbtfo",
    "bcjub",
    "efoqp",
    "qvsfj",
    "kbllv",
    "hbohv",
    "njupo",
    "opvib",
    "zvvxb",
    "cbufj",
    "tbjsp",
    "jtblb",
    "izpvj",
    "lpspv",
    "ftbnb",
    "{btiv",
    "opvgv",
    "jocvo",
    "ijgvo",
    "njoof",
    "bsvlv",
    "sboob",
    "hpkpv",
    "tvpup",
    "lpvnf",
    "upsfo",
    "xbjqb",
    "jhzpv",
    "lbjzv",
    "pvubj",
    "tvnpv",
    "sbjnv",
    "sbjtv",
    "fohbo",
    "tibkj",
    "cbtfo",
    "zpufj",
    "lpftv",
    "zpljo",
    "gvtpj",
    "plvsv",
    "ebutv",
    "lpbkj",
    "{focv",
    "epvtb",
    "gbvsv",
    "tvupv",
    "upvhf",
    "qbjsv",
    "updij",
    "tfocj",
    "lbkpv",
    "cvsfo",
    "lj{pv",
    "pnbib",
    "ifjbo",
    "jzblf",
    "nvtfo",
    "cpohp",
    "zbtvj",
    "lfjhp",
    "tvokj",
    "hplbj",
    "jkjnv",
    "ljocj",
    "pvkpv",
    "nfj{v",
    "spvlj",
    "tivcv",
    "hfocb",
    "lfohp",
    "tijsp",
    "juubj",
    "opvep",
    "qbjlb",
    "epvlf",
    "tp{bj",
    "tbjfo",
    "zpuup",
    "lfjnf",
    "ubjsv",
    "qjdij",
    "upvfj",
    "gvsvf",
    "blvup",
    "utvsj",
    "ojhpv",
    "tbspo",
    "hvubj",
    "blbov",
    "bocvo",
    "nvlbf",
    "ubcjo",
    "sjohp",
    "zpvlp",
    "nfjhp",
    "blbsj",
    "kvvnf",
    "pkplv",
    "zpvhj",
    "pvifo",
    "kvolb",
    "plpnp",
    "josfj",
    "tpv{v",
    "difjo",
    "plpup",
    "folbj",
    "nvubj",
    "ipzvv",
    "qjsfo",
    "cvepv",
    "gvsvv",
    "nvlvv",
    "vnflj",
    "fepvj",
    "pupnp",
    "joojo",
    "spufj",
    "tbufo",
    "ijptv",
    "hftij",
    "sbllp",
    "tboqp",
    "jlpsv",
    "hvojo",
    "lpjlb",
    "iboqv",
    "tbjkj",
    "{pvhf",
    "tfebj",
    "lpvgv",
    "lvobo",
    "tivnf",
    "lzblv",
    "tbepv",
    "foebj",
    "upjub",
    "ofjtv",
    "ojlbj",
    "hplpv",
    "tijlv",
    "zvlzb",
    "tpblv",
    "hpufo",
    "opuup",
    "jszvv",
    "f{bsb",
    "gvtpo",
    "uputv",
    "difsp",
    "bxbtv",
    "nvopv",
    "ptivo",
    "zbcpv",
    "ejohj",
    "kplzp",
    "ibjgv",
    "pufsb",
    "ipubj",
    "blvkj",
    "tvuup",
    "lbeep",
    "gv{vj",
    "spefp",
    "sjosj",
    "lbolp",
    "cbuub",
    "ibtpv",
    "ljkjo",
    "qjllv",
    "cjqqv",
    "uftpv",
    "gvtfo",
    "sptfo",
    "nbllj",
    "sfjkj",
    "objup",
    "gvutv",
    "uppsj",
    "pzblv",
    "hvsjo",
    "fljlb",
    "tbtiv",
    "lpebj",
    "njtbp",
    "tfjlv",
    "splfo",
    "bsbxb",
    "kpvtp",
    "zbibo",
    "nfufo",
    "ibjkp",
    "ebj{v",
    "vjoep",
    "tfjvo",
    "lzpsj",
    "iblbp",
    "fepsv",
    "ubcpv",
    "tblfj",
    "zvsvj",
    "kjpsv",
    "ijuup",
    "hplvv",
    "lpszp",
    "pdipb",
    "psfjo",
    "pcjsv",
    "npzpv",
    "joupv",
    "nvhfo",
    "ijcpv",
    "ufo{b",
    "spohj",
    "lpvtv",
    "hfokj",
    "jcbsb",
    "nvdij",
    "sjzpv",
    "kvotv",
    "bplpv",
    "jnjep",
    "hblvj",
    "tijej",
    "gvibj",
    "cpotp",
    "hpkvv",
    "ozv{v",
    "nbepj",
    "lbipv",
    "fsbnv",
    "lpvcv",
    "vfufo",
    "iboep",
    "zpcpv",
    "fjzpv",
    "pnj{v",
    "tpvlv",
    "ubcvo",
    "fsvnv",
    "{vlbj",
    "npsjo",
    "fjlbo",
    "hjolb",
    "ubjup",
    "fsfcf",
    "btbsj",
    "hvsfj",
    "bsjlb",
    "cpvlp",
    "tijhb",
    "ufjfo",
    "lfjsj",
    "nbupj",
    "xbsbj",
    "ojsvj",
    "nfttf",
    "gfotv",
    "ofutv",
    "vfjub",
    "ipsjf",
    "ebzbo",
    "ebufj",
    "gvvhj",
    "ifoqv",
    "lvtbj",
    "ljnpj",
    "zpvnb",
    "hflbj",
    "kvobo",
    "bttfo",
    "vsjof",
    "lfouf",
    "tijbo",
    "bnfij",
    "opvsj",
    "uplfj",
    "nbhhv",
    "blvsb",
    "puplp",
    "svutv",
    "tvljo",
    "lbopv",
    "lzvcb",
    "cpvsb",
    "lbibo",
    "fsbcv",
    "tipup",
    "sfllb",
    "ojcvj",
    "tvxbo",
    "lphbo",
    "nvlvj",
    "nbocv",
    "qbutv",
    "nbupv",
    "ebefo",
    "lptbo",
    "vtbhj",
    "kblfj",
    "kbkkj",
    "tfjsj",
    "opsfo",
    "tbtfo",
    "jxbob",
    "hvdij",
    "diblb",
    "lvsbo",
    "cbokp",
    "pqfsv",
    "bolfo",
    "cfoeb",
    "ubkpv",
    "pqfsb",
    "botfj",
    "obohp",
    "efqqb",
    "hpiip",
    "{folj",
    "tijtb",
    "bojkb",
    "tpvgv",
    "kbolj",
    "lpsfj",
    "nbllb",
    "hjopv",
    "tvvkj",
    "nftfj",
    "qbokp",
    "psfsv",
    "tbjlp",
    "upfoj",
    "zblbo",
    "dijxb",
    "tbhpv",
    "ljtib",
    "sjofo",
    "kj{fo",
    "gvepv",
    "ljosj",
    "iphhv",
    "ubjhb",
    "fonfj",
    "lpepv",
    "febnv",
    "xblbj",
    "ufljj",
    "tivsv",
    "ufokj",
    "uflbj",
    "gvsjo",
    "ptbnv",
    "lfupo",
    "hbjsp",
    "ljokj",
    "ljocv",
    "nbsvj",
    "sjtpv",
    "ofbhf",
    "cbsfj",
    "zpvlb",
    "upqqv",
    "upoef",
    "cfosj",
    "spbsv",
    "ibllj",
    "obocv",
    "qpsjp",
    "ubsjo",
    "pzbep",
    "tbtpf",
    "nvsvj",
    "bcbsb",
    "kvflj",
    "kbllj",
    "ibjlb",
    "ljplv",
    "tpgvp",
    "cvijo",
    "ubhfo",
    "fljnv",
    "uftij",
    "sbjzv",
    "hbcpv",
    "upvcb",
    "tijib",
    "fljtv",
    "lbokv",
    "utvzb",
    "ofllv",
    "npfsv",
    "ljubf",
    "vjoub",
    "qjoup",
    "tbokp",
    "sbllb",
    "lpnbf",
    "cvllv",
    "ibohb",
    "tibep",
    "tvjsv",
    "bobcb",
    "nvvib",
    "epuup",
    "ubttp",
    "qbvsj",
    "zpuub",
    "lfonf",
    "vozpv",
    "tibnf",
    "nbzpv",
    "lfjhb",
    "ljllb",
    "xblzp",
    "{fojo",
    "kjnfj",
    "cbhhv",
    "utvsf",
    "iblpo",
    "tibfj",
    "lbutv",
    "jlbtv",
    "lfsvo",
    "ufolb",
    "lvplv",
    "obogv",
    "lblzp",
    "nboup",
    "fsvgv",
    "{bjzp",
    "tivfo",
    "vnbzb",
    "blbhf",
    "vsvgv",
    "lvkpv",
    "sjohv",
    "jsplf",
    "ejsbo",
    "j{vsf",
    "ojtij",
    "objkj",
    "hpvlb",
    "sjqqb",
    "hpvsv",
    "ipqqb",
    "szpvj",
    "hpcbo",
    "{fotf",
    "lblvv",
    "ebufo",
    "pzptp",
    "ephpv",
    "blbbj",
    "jlbsv",
    "fozpv",
    "plpsj",
    "lfcjo",
    "sbosj",
    "tijtp",
    "utvzv",
    "vsjuf",
    "ifjlj",
    "epsvj",
    "jjnbf",
    "vlbsv",
    "ufipo",
    "tbupj",
    "hjbsb",
    "jodij",
    "fo{bo",
    "qvsfo",
    "hvspv",
    "sfjsb",
    "sjubo",
    "ibtfj",
    "lpvsj",
    "tpvip",
    "jizpv",
    "ibokj",
    "qbolv",
    "psfbv",
    "obutv",
    "lpvlp",
    "lfjcv",
    "dibub",
    "lzb{b",
    "tfoup",
    "hplbo",
    "kjsbj",
    "tiblp",
    "cvtip",
    "ljhvv",
    "cbszv",
    "vsbkj",
    "tfooj",
    "cfllp",
    "juufj",
    "svohf",
    "qbuup",
    "pibib",
    "hpnfo",
    "lvnjo",
    "polfo",
    "wjkpo",
    "lbouf",
    "ubolv",
    "ufnbf",
    "bplbj",
    "pvopv",
    "vtvsj",
    "kblfo",
    "bolbj",
    "jzboj",
    "gvtbo",
    "gvjsj",
    "npvtv",
    "hptij",
    "upipv",
    "lbolv",
    "gvdij",
    "tp{pv",
    "bzvnv",
    "ibtiv",
    "ubjqv",
    "tbjhj",
    "szvvj",
    "hbjep",
    "kvzpv",
    "ibosp",
    "nbjzp",
    "votpv",
    "cpjtv",
    "blvnv",
    "sjflj",
    "ibjsj",
    "tblpv",
    "jfnfo",
    "tijnp",
    "kjnfo",
    "ojlvj",
    "gvvjo",
    "vfppj",
    "gvllp",
    "opolj",
    "iplpv",
    "kvlbo",
    "kjzpv",
    "publv",
    "qbqvb",
    "sjcpo",
    "fufsv",
    "tfosp",
    "lbopo",
    "kpvfj",
    "njuup",
    "lpvsp",
    "{folv",
    "ljotb",
    "npifb",
    "cfsvo",
    "lbolf",
    "hvbcb",
    "ufjsf",
    "tvqfb",
    "ubopv",
    "vnbof",
    "hbspo",
    "blvvo",
    "objtv",
    "plvoj",
    "sbqqv",
    "nbjnb",
    "pvbxb",
    "zbepo",
    "tp{fj",
    "vofsj",
    "pijsv",
    "hbefo",
    "sblbo",
    "ebjcv",
    "fokjo",
    "lpfsv",
    "tijxb",
    "kpojo",
    "ibkkj",
    "piblp",
    "lbozv",
    "spkjf",
    "bebkp",
    "nvipo",
    "ljozv",
    "ipkvv",
    "kjkpv",
    "bupnf",
    "pljcb",
    "epvsj",
    "objzb",
    "joofo",
    "bjtij",
    "cvzpv",
    "ufjpo",
    "bjkjo",
    "ijtij",
    "sjlbo",
    "ipvcj",
    "ebvnb",
    "lb{bo",
    "ofoib",
    "nfupv",
    "ojfsv",
    "nplfj",
    "hveep",
    "lfjlp",
    "polfj",
    "gpoeb",
    "kvtfj",
    "ofebo",
    "pspsb",
    "lplbp",
    "jljpj",
    "gvibo",
    "tpojo",
    "qpeep",
    "lbjbo",
    "lbdij",
    "ufjep",
    "nvsvo",
    "bopep",
    "cjubj",
    "lpfzp",
    "vjo{b",
    "epvsp",
    "jzbnj",
    "ppbnf",
    "ljipv",
    "hbkpv",
    "puphj",
    "gvsbj",
    "cbtip",
    "hbebj",
    "qbsjb",
    "iboub",
    "ebotb",
    "bxbcj",
    "juupv",
    "ljhbf",
    "hbocp",
    "vtvcb",
    "sbllj",
    "jljtb",
    "pxbtv",
    "blbof",
    "psplb",
    "dijnj",
    "jqqbo",
    "ipvsj",
    "nbeep",
    "tflbj",
    "sfjlj",
    "kvvzv",
    "sfzpo",
    "sfeep",
    "{bohf",
    "lfdij",
    "tvtij",
    "lpllj",
    "blvnf",
    "efczv",
    "zvvcf",
    "ljsbj",
    "qpqqv",
    "pcbbo",
    "ebvej",
    "tbonj",
    "fljjf",
    "hbolb",
    "lfoqb",
    "bupoj",
    "bnjop",
    "zvfsv",
    "epgjo",
    "lvspo",
    "ubjpv",
    "nbfoj",
    "tijwv",
    "zpebo",
    "tivcp",
    "oflfj",
    "kjlpv",
    "tfjbj",
    "cbjpo",
    "pjsbo",
    "tivcj",
    "lboob",
    "ufutv",
    "obfsv",
    "efocb",
    "ljebj",
    "tbjip",
    "qzvsf",
    "vnfsv",
    "qbdij",
    "pobcf",
    "lbjjo",
    "sfoup",
    "{bozp",
    "sjufo",
    "{vjkj",
    "pubxb",
    "lbokj",
    "cjnjj",
    "tpvcj",
    "nfokp",
    "nbzpj",
    "epupv",
    "pfutv",
    "phzpv",
    "hbokj",
    "tpvjo",
    "kjtib",
    "gvnjo",
    "lb{fj",
    "lfjxb",
    "njepv",
    "ibpup",
    "kphbj",
    "tijhj",
    "ufoef",
    "zbtiv",
    "kjbkj",
    "lbjtv",
    "upptb",
    "tvqjo",
    "tibcb",
    "cplpv",
    "jcjsv",
    "hbutv",
    "upvhj",
    "psjlp",
    "kjcjf",
    "pvlbo",
    "opvoj",
    "cfeep",
    "lbqqb",
    "ojolj",
    "ubjtb",
    "tivkv",
    "hfooj",
    "{buup",
    "hjnfj",
    "ijzpv",
    "pipof",
    "lpvbv",
    "btv{v",
    "fsflj",
    "pvhpo",
    "sbohf",
    "tpvhp",
    "tfdij",
    "njlbo",
    "tfjcj",
    "tijtv",
    "pczpv",
    "tvlvj",
    "kplpv",
    "buupv",
    "lvufo",
    "lpozb",
    "kvvlv",
    "spjep",
    "tijnf",
    "bsbub",
    "tfjib",
    "tphbo",
    "ipifj",
    "joifj",
    "zvcbb",
    "uplpv",
    "ufpop",
    "epvnb",
    "lpvnv",
    "tvfsv",
    "qplbo",
    "tbohp",
    "utvnb",
    "zplfj",
    "bohpv",
    "fnpkj",
    "jolfj",
    "jnpkp",
    "cjcpv",
    "tfjjo",
    "efllj",
    "kvnpo",
    "eplvf",
    "btpcv",
    "xbhpo",
    "bljnb",
    "tbdib",
    "jszpv",
    "ibifo",
    "btbtf",
    "ifjcb",
    "ibtpo",
    "cfupo",
    "lfjuf",
    "ijtip",
    "cjtbj",
    "lphpv",
    "putvf",
    "ebjlp",
    "ljjsp",
    "ibjlv",
    "cvoqb",
    "ebjzb",
    "flblj",
    "ojtpv",
    "kvipv",
    "xbjgv",
    "lpjov",
    "ofjsp",
    "tbjfj",
    "ljtpj",
    "kbhpo",
    "ppbsf",
    "sbjpo",
    "kjtij",
    "peflp",
    "fhvsv",
    "ptpgv",
    "lfibj",
    "pvcpv",
    "nfouf",
    "lfohj",
    "lpvcp",
    "spvhf",
    "gvvzv",
    "lbcfo",
    "phzbb",
    "sboqf",
    "tbolv",
    "tbzvv",
    "jcvsv",
    "btvlj",
    "ibonb",
    "ibspv",
    "pupob",
    "kvokj",
    "ptpcp",
    "josbo",
    "ojkvv",
    "bszvv",
    "eboob",
    "bolbo",
    "bepcj",
    "foupv",
    "febsj",
    "tvnbj",
    "tvbob",
    "tfoij",
    "tvqbj",
    "jubnv",
    "lfjtv",
    "bhbsv",
    "epoup",
    "ibjkj",
    "tvubb",
    "kpvlp",
    "epspv",
    "vsvhb",
    "bobpv",
    "ifoqj",
    "gfjep",
    "pojpo",
    "kbjcv",
    "pnjlj",
    "hjipv",
    "gvifj",
    "tijsj",
    "cveeb",
    "fophv",
    "gfj{v",
    "ebjhj",
    "fodij",
    "bnjnf",
    "tbljo",
    "fjifj",
    "ipbtv",
    "tpvjf",
    "jtbnj",
    "ufspv",
    "spvcb",
    "tfohj",
    "bnbsj",
    "sfjlp",
    "npqqv",
    "tfosv",
    "tijpo",
    "lbpsv",
    "nfjpv",
    "ubjlv",
    "gvsfb",
    "ijsjo",
    "psblv",
    "gvuub",
    "ufjlj",
    "lvonv",
    "hbtij",
    "vsbip",
    "ufjnj",
    "ibkpv",
    "hbotb",
    "hbllj",
    "pobhp",
    "sfjfo",
    "qfjtv",
    "dijnv",
    "ofoep",
    "nbupo",
    "fcjof",
    "kpvip",
    "sfllj",
    "kpvjo",
    "spcbo",
    "ifolp",
    "sjocv",
    "kvijo",
    "btvub",
    "vlfbj",
    "opj{v",
    "sjoep",
    "ubqjo",
    "bopnj",
    "cpvgv",
    "nfllj",
    "ubhvj",
    "xbifj",
    "ijqqv",
    "foqfo",
    "pokjo",
    "ibotv",
    "bebnv",
    "jbokp",
    "qpdij",
    "tvupo",
    "jtbnf",
    "lfjbj",
    "epv{b",
    "nbhfj",
    "zpvsj",
    "jospv",
    "fnpup",
    "nposp",
    "qflbo",
    "tbupv",
    "sjnbo",
    "bspib",
    "hjjuf",
    "sfohb",
    "tibxb",
    "b{vlf",
    "pljzb",
    "iptpv",
    "pvifj",
    "ppjub",
    "folfj",
    "ijebj",
    "jutvv",
    "pobsb",
    "nzvsv",
    "njkpv",
    "kjqqv",
    "lvjbj",
    "nbkbo",
    "qpoup",
    "ubokj",
    "tivkj",
    "lpv{v",
    "tbjhb",
    "tpobj",
    "lbnjo",
    "jlvsv",
    "zbipv",
    "njnbj",
    "ozvtv",
    "lpufj",
    "hptfo",
    "ijtfo",
    "{pvfj",
    "tfjgv",
    "lpvbo",
    "blvtp",
    "fbhbo",
    "tvkjj",
    "ofjwj",
    "{vhbj",
    "kpvhv",
    "ufonb",
    "sboqv",
    "kvvhp",
    "flvtv",
    "btbhj",
    "szpvf",
    "hftfo",
    "gvjoj",
    "pqvob",
    "dijhp",
    "nbhbj",
    "spvsp",
    "lpvzv",
    "lfjzp",
    "epsbo",
    "jopsj",
    "ipvup",
    "tpvib",
    "pufuf",
    "bpbtb",
    "ptfkj",
    "tivfj",
    "tvqvo",
    "ipvhb",
    "sfo{b",
    "kjnbf",
    "bsblb",
    "plfsb",
    "tbjlv",
    "lzbgf",
    "cbocv",
    "ojogv",
    "lbohp",
    "ljohv",
    "zpvfj",
    "{vnfo",
    "spupo",
    "gvocp",
    "jhvsv",
    "ijkvv",
    "iblvb",
    "tijfb",
    "lfjij",
    "hfjhj",
    "jubsj",
    "lpqqj",
    "vfkkj",
    "tfolp",
    "potfo",
    "kvvsj",
    "utvjf",
    "uptip",
    "nvjhj",
    "ubhvv",
    "lvgvv",
    "tijjf",
    "sfotb",
    "ubjlp",
    "cboup",
    "diblj",
    "ufplf",
    "fjkjp",
    "hfobo",
    "nfejb",
    "ppjtb",
    "qjbop",
    "nfllb",
    "bufof",
    "tibsj",
    "jlvfj",
    "sfjej",
    "ipttb",
    "bsbtv",
    "ifoob",
    "svjkj",
    "upibo",
    "ojozb",
    "lpkjo",
    "zpvcb",
    "puphb",
    "blvcj",
    "uplvo",
    "ipvxb",
    "bsjkv",
    "gvkjo",
    "nfjlb",
    "cvubj",
    "sposj",
    "gvhvo",
    "njkjo",
    "hjobv",
    "vsfsv",
    "npvsb",
    "pfobj",
    "gpjsv",
    "lblbo",
    "sjuub",
    "qvsjo",
    "hplfj",
    "bsjob",
    "upjsf",
    "jqqpv",
    "tfqjb",
    "lbjkp",
    "ljlpo",
    "hjolp",
    "jttbj",
    "buppj",
    "lpbsb",
    "bcjtv",
    "ebjnb",
    "ifjsj",
    "nbtvj",
    "tphvv",
    "fjzvv",
    "fsvhv",
    "zptbj",
    "ptflj",
    "lpolv",
    "ljocp",
    "ubocp",
    "zvvsj",
    "ljllv",
    "cpvlj",
    "pnjzb",
    "tfocp",
    "hvsfo",
    "ebsjo",
    "lb{fo",
    "epkjo",
    "jebtv",
    "volpv",
    "hjojb",
    "tipnv",
    "nfebo",
    "lboej",
    "bcpup",
    "phpsj",
    "plvcj",
    "iboqb",
    "zbljf",
    "obsbv",
    "sfjep",
    "obubo",
    "fohfj",
    "dipvv",
    "blbkj",
    "cjijo",
    "zvvhb",
    "ebflj",
    "sbnjb",
    "hzb{b",
    "ipszp",
    "gpupo",
    "lptiv",
    "sfjcb",
    "kpvhp",
    "hfohp",
    "nfjlj",
    "ijutv",
    "{bonv",
    "tboqv",
    "cjfsb",
    "ijsfj",
    "ptplv",
    "izvnb",
    "ubjnf",
    "ljcbo",
    "uboqb",
    "dijpo",
    "ubebj",
    "upoup",
    "zbcbj",
    "hbjtv",
    "plbcv",
    "njipv",
    "lvtbv",
    "nbdij",
    "nfjoj",
    "sfjzb",
    "tptvv",
    "lfsbj",
    "jlbef",
    "nbfif",
    "xbtib",
    "lbvsv",
    "plvtv",
    "lbtib",
    "juflj",
    "kvojb",
    "lfkpv",
    "ijfsv",
    "ipvzp",
    "foebo",
    "lpjsf",
    "epvhj",
    "ufohb",
    "tbvob",
    "bjnpo",
    "foufo",
    "cpllj",
    "upeep",
    "cbspb",
    "jolzp",
    "tivpo",
    "cpvhj",
    "bkjsv",
    "kvubj",
    "svtij",
    "cbjeb",
    "tibup",
    "lvxbj",
    "cpjsb",
    "cfo{v",
    "bjtip",
    "szvup",
    "kvvlj",
    "kpvbj",
    "ufttv",
    "kpvcb",
    "foubj",
    "tbotv",
    "pnfhb",
    "tbjup",
    "spcpv",
    "nvuub",
    "{bllv",
    "nvhbj",
    "lbifo",
    "lpvcf",
    "npvsj",
    "{fosb",
    "tvubo",
    "utvkj",
    "tipoj",
    "lbkjo",
    "fsbup",
    "fupsv",
    "epspb",
    "jotpv",
    "ljvsj",
    "jlpkj",
    "sjtfj",
    "epnjo",
    "ufjjo",
    "tiblf",
    "ibjhb",
    "upohv",
    "zvtfj",
    "lfjzb",
    "wboqv",
    "ljofo",
    "kbjsp",
    "bcfsv",
    "tbsvo",
    "jkblv",
    "cjlfj",
    "ipocv",
    "ojipo",
    "kvvhv",
    "tijkp",
    "kjfnv",
    "blfsv",
    "tpvvo",
    "ubggj",
    "ubjep",
    "jtvsv",
    "cbkkj",
    "tpvbo",
    "gpoup",
    "kpcbo",
    "lbobj",
    "sboep",
    "sfjqv",
    "jocff",
    "nfnbj",
    "bjnjo",
    "cfoqj",
    "xbjsv",
    "qbllv",
    "nfbuf",
    "zbsbv",
    "qbokj",
    "lpcbj",
    "ufjsv",
    "gvvkj",
    "sbhvo",
    "tivgv",
    "ephhv",
    "ijjub",
    "qfohb",
    "nbbkj",
    "hfogv",
    "ljonv",
    "tplpv",
    "jhvtb",
    "gvoep",
    "ibqqv",
    "fjvub",
    "ubj{b",
    "hbllb",
    "eptvv",
    "ebjbo",
    "lbsjb",
    "ubjib",
    "kvhpo",
    "tvjtv",
    "bjcvo",
    "psvej",
    "ufkvo",
    "joibo",
    "opqqp",
    "hfonj",
    "ipocb",
    "lpvip",
    "cbotv",
    "uftip",
    "hjoxb",
    "upvzv",
    "lplfo",
    "cvtpv",
    "tijzp",
    "kjkjo",
    "{fohj",
    "iblpv",
    "jfibf",
    "njsfo",
    "upvsj",
    "fnfsj",
    "fttfj",
    "nbfof",
    "zvobj",
    "lbtiv",
    "nbohb",
    "sjkjo",
    "tfjsb",
    "kjlfo",
    "bojlj",
    "oblbj",
    "tpkpv",
    "jnbkv",
    "jotvv",
    "izvnp",
    "npoij",
    "zbspv",
    "fcjnp",
    "ibolb",
    "ebtfj",
    "bpjbp",
    "ipoop",
    "{fvtv",
    "sbepo",
    "kjlzp",
    "ubotb",
    "cjzpj",
    "lblbb",
    "sjoqb",
    "sjonp",
    "kvohj",
    "ljnfj",
    "ipspv",
    "plvhj",
    "lfonb",
    "upvtv",
    "lpvhb",
    "lpvsv",
    "tvlfj",
    "peptv",
    "jtblp",
    "bjspo",
    "lpefo",
    "tbonb",
    "ljtfo",
    "ubhhv",
    "gv{bj",
    "cjtvj",
    "lzbej",
    "cbnfo",
    "utvhj",
    "hzbhv",
    "nftpv",
    "tbplv",
    "ubjzb",
    "gvcfo",
    "kvgvo",
    "ufotv",
    "qvtbo",
    "ipvhf",
    "sjogv",
    "lfjsf",
    "opvfo",
    "ofoof",
    "jttip",
    "sfojo",
    "bjlzv",
    "gvspv",
    "nflbp",
    "zbqqj",
    "ufoqb",
    "ebqqj",
    "cbjlb",
    "hbvej",
    "hbubj",
    "zbllf",
    "obuup",
    "hbsbo",
    "gvohj",
    "ljqqv",
    "lpoxb",
    "cbjup",
    "epvtf",
    "kjcvo",
    "jllbj",
    "nj{vp",
    "pnpsj",
    "lblbv",
    "kjcpv",
    "tibhj",
    "jobtb",
    "lvsvv",
    "gv{fj",
    "tfoqv",
    "tfebo",
    "cfsfo",
    "kjepv",
    "cvjbj",
    "hbspb",
    "lpoqb",
    "tpfsv",
    "bcvkb",
    "qfolj",
    "jfljo",
    "gvflj",
    "hvbop",
    "fupob",
    "pvofo",
    "tvoob",
    "sjnfo",
    "btbpv",
    "ufjpv",
    "lbjfo",
    "btvnj",
    "sjutv",
    "ljhbj",
    "vqqvo",
    "cfohp",
    "lbogv",
    "lbosp",
    "psptv",
    "tbozp",
    "pljob",
    "upspj",
    "nfcbf",
    "pvtfo",
    "zpkpv",
    "jtblj",
    "ufozv",
    "gjohb",
    "cvolp",
    "epvef",
    "lbcvo",
    "ojtbj",
    "hbjzb",
    "njpnp",
    "joqfj",
    "zbkpv",
    "dijcj",
    "vuubf",
    "njtfj",
    "vsbsb",
    "nvtbj",
    "hpubj",
    "eptpv",
    "hplfp",
    "fuplj",
    "iptbj",
    "xbjzb",
    "jotiv",
    "hvjup",
    "boobo",
    "xblbo",
    "gboep",
    "tivnj",
    "plvsb",
    "jttfo",
    "vtvsv",
    "lpbnj",
    "jqqjo",
    "tbspv",
    "pvipv",
    "ljcjo",
    "tptbo",
    "jocpv",
    "fjnjo",
    "kpspo",
    "eponb",
    "sfjlb",
    "nbohp",
    "jhblv",
    "bhflv",
    "dijzp",
    "pibkj",
    "spvuf",
    "eblbo",
    "tfcvo",
    "jubcb",
    "nfjkp",
    "nfjzb",
    "psvhv",
    "peplf",
    "pnptb",
    "psvep",
    "iphbo",
    "ljnbj",
    "ptblf",
    "ebjwv",
    "ljtvv",
    "npebf",
    "nfotb",
    "ebsjb",
    "nbjsb",
    "tiplb",
    "lfjep",
    "spllb",
    "ifspo",
    "hfjhp",
    "{vllv",
    "kpuup",
    "ifjkj",
    "upebf",
    "ptbsb",
    "jnboj",
    "fjupo",
    "jzblv",
    "dipsv",
    "nvtfj",
    "tblbf",
    "lfolv",
    "blvhj",
    "ipvjo",
    "cflpo",
    "nbzvv",
    "ebcfo",
    "zpblf",
    "cpsvo",
    "ipvkj",
    "ljeep",
    "tipjo",
    "ptipv",
    "ipv{v",
    "fjhpv",
    "spvzb",
    "tijhp",
    "pcjub",
    "tpspj",
    "tiplp",
    "cpjsv",
    "fsjlb",
    "ijqqj",
    "hf{bj",
    "bsvsv",
    "ljjoj",
    "lfsjj",
    "difsj",
    "lbcbo",
    "iponb",
    "ubjbo",
    "tbsbv",
    "upvkj",
    "kjjnb",
    "ifjzb",
    "efjnv",
    "tbcpj",
    "jolpv",
    "qjbsv",
    "ibtbj",
    "ebjpv",
    "pocbo",
    "ufubo",
    "kpvsp",
    "ubozb",
    "sbolv",
    "nfoqv",
    "pkjlf",
    "ubohj",
    "tbonp",
    "fjofo",
    "cvtiv",
    "xbhfo",
    "zpvhb",
    "lppoj",
    "gvtbj",
    "jjojo",
    "xbjsj",
    "bjkpv",
    "ofjsv",
    "lbsfo",
    "epllv",
    "ubtbo",
    "qjuup",
    "ifnjo",
    "lpjsv",
    "dijcb",
    "lpohb",
    "kjozb",
    "jopgv",
    "tfokb",
    "bogfb",
    "fqpob",
    "qjolv",
    "ibllb",
    "kjsfj",
    "zvvfj",
    "joejp",
    "hvoup",
    "kvtij",
    "johpv",
    "sjcfo",
    "tfolj",
    "iplfo",
    "cfoep",
    "{ftfj",
    "ljkvv",
    "lpoqp",
    "nbojb",
    "spepo",
    "qjifo",
    "ufllj",
    "lvepv",
    "bufob",
    "pojcj",
    "sbjeb",
    "sjdij",
    "epebj",
    "ipoep",
    "cbjlv",
    "fofnj",
    "{fhfo",
    "gbolj",
    "sbjtf",
    "gvolv",
    "jxbtf",
    "tplbj",
    "xbipv",
    "zvvkj",
    "pljif",
    "upvgv",
    "hbnpo",
    "pebuf",
    "kjlvv",
    "sbjgv",
    "ubtiv",
    "psjcv",
    "zbllj",
    "bjlpo",
    "{pocb",
    "cpvpo",
    "lvibj",
    "cbspo",
    "b{bnj",
    "bonbo",
    "{bjsv",
    "lpifj",
    "kjolb",
    "obnbf",
    "poubj",
    "lbjlv",
    "kjotb",
    "jbgpo",
    "nvlbv",
    "qboup",
    "cbjcv",
    "tbnpb",
    "pcplp",
    "objub",
    "ijljo",
    "ebjjo",
    "bobhp",
    "tvjsj",
    "qjfsp",
    "kvvkj",
    "npvgv",
    "btfcj",
    "cpouf",
    "hfonb",
    "ljlzp",
    "b{plv",
    "wbkjo",
    "tbuuf",
    "tvlbj",
    "tfoob",
    "lpvcj",
    "zpspj",
    "lpjlj",
    "joopv",
    "sbobj",
    "bojnf",
    "lbo{b",
    "kjefo",
    "ubonf",
    "cboeb",
    "njolv",
    "tipuf",
    "ibjhp",
    "spoep",
    "tbtpj",
    "sjtij",
    "hbcbo",
    "hjljo",
    "plbvf",
    "pvdij",
    "bsbnp",
    "hfljj",
    "fsvcp",
    "upggj",
    "sjohb",
    "pepsj",
    "fsfsv",
    "lfjsb",
    "nfuub",
    "cpefj",
    "jsjnf",
    "zbpzb",
    "cbsjp",
    "ibfnf",
    "hzpvj",
    "objlj",
    "tpepv",
    "hpobo",
    "gvonf",
    "fsjzb",
    "sbjhb",
    "sfuup",
    "nfjbo",
    "nfonj",
    "lvlvj",
    "lbjnv",
    "ipvpv",
    "tpnbo",
    "gvsbv",
    "opllb",
    "qvsbp",
    "tibcv",
    "sjoup",
    "hvolj",
    "lvj{f",
    "sf{vo",
    "lfotp",
    "jtivv",
    "lpdij",
    "gvcvo",
    "tbbcj",
    "upllp",
    "upllb",
    "bupef",
    "blbfj",
    "diftb",
    "zpvib",
    "ljolb",
    "nvlpo",
    "v{vsb",
    "zvvlp",
    "lppsj",
    "hfozv",
    "lvcpv",
    "ibxbj",
    "eboqv",
    "nbolj",
    "bhblv",
    "qjbsj",
    "ibvtv",
    "upojo",
    "nbepv",
    "njtpv",
    "tpupj",
    "pojsv",
    "jnjob",
    "vlbtv",
    "lpohj",
    "gbsbp",
    "qvsbo",
    "vsjvf",
    "objgv",
    "ifipv",
    "plbnj",
    "hfotv",
    "tvutv",
    "ebotv",
    "qjbgv",
    "pvtvj",
    "sjibo",
    "hpeep",
    "iptij",
    "sfjsv",
    "tvjnb",
    "lfocb",
    "cptvo",
    "zvfzv",
    "lbj{v",
    "gfjlv",
    "boofj",
    "pcpsp",
    "ebtbj",
    "ebjtv",
    "iblfj",
    "blb{v",
    "zpvhf",
    "uptib",
    "jqvsv",
    "uplvv",
    "kjolv",
    "qfqqb",
    "spupv",
    "nbsfj",
    "bebob",
    "ebtib",
    "zvtij",
    "hbspv",
    "qpvsv",
    "tvspv",
    "sfjpo",
    "qpoqv",
    "npcpv",
    "efllb",
    "sjkvo",
    "dibup",
    "hjnpo",
    "fjubo",
    "lpopv",
    "jcvtv",
    "ebsvj",
    "zbozb",
    "obebj",
    "kpvub",
    "fczpv",
    "bljcb",
    "tfcjo",
    "cpspj",
    "ufjsj",
    "pkjlj",
    "ojebj",
    "lvvcp",
    "tbj{v",
    "ofokj",
    "lboup",
    "tibnv",
    "iboxb",
    "lpvib",
    "pvebj",
    "nfohp",
    "kpvuf",
    "opvtp",
    "plpkp",
    "kjtpo",
    "vfjwv",
    "ufblj",
    "qbtij",
    "cpebj",
    "tivzv",
    "ipvnv",
    "nvszp",
    "vsbnb",
    "poebo",
    "bcblb",
    "sjebo",
    "sbptv",
    "sjolb",
    "{pvip",
    "ubjip",
    "jtfzb",
    "ipggb",
    "jsvlb",
    "tfjhj",
    "tvfub",
    "cblfj",
    "bupsj",
    "zbpsb",
    "cbohb",
    "joepv",
    "gjsfp",
    "qzvkj",
    "gvhfo",
    "kvooj",
    "cjtbv",
    "lpepo",
    "tpbwf",
    "lfjkv",
    "pupup",
    "obohj",
    "hpvjo",
    "njipo",
    "qbjpo",
    "kpnfo",
    "difeb",
    "qjkjo",
    "lpspo",
    "qpotv",
    "obtij",
    "upouf",
    "ebjtb",
    "sbjob",
    "lbljo",
    "cjefp",
    "vtvef",
    "upjlj",
    "njzpv",
    "nzv{v",
    "btftv",
    "pvfsv",
    "ebjlj",
    "sbdij",
    "upubo",
    "tbibj",
    "wpubo",
    "ipzpv",
    "czpvv",
    "pljuf",
    "zbolj",
    "ipvqv",
    "blbsv",
    "fuupv",
    "bhfzb",
    "ojtff",
    "sjkkj",
    "bodij",
    "wjefp",
    "obobf",
    "vnjoj",
    "blbnv",
    "dijzb",
    "tvfkj",
    "lfosj",
    "ip{fo",
    "epcbj",
    "vsbnv",
    "sbotv",
    "ejsfj",
    "izv{v",
    "pnpup",
    "fj{fo",
    "ubotv",
    "ubjhv",
    "lbjhb",
    "cjolv",
    "tbcfj",
    "gvbkj",
    "objoj",
    "bqbup",
    "jotfj",
    "zbcvo",
    "qfjef",
    "ebjoj",
    "nj{pv",
    "tbkjo",
    "cj{bj",
    "ipllv",
    "ijtpv",
    "npvkb",
    "tvjlj",
    "jcbsj",
    "lpocp",
    "upo{b",
    "spvkp",
    "sjlpf",
    "cjuup",
    "sfjtv",
    "lvvzv",
    "jnpop",
    "tfjkb",
    "psv{p",
    "pifzb",
    "sjtbo",
    "fsbtb",
    "gvhvv",
    "pvlpv",
    "ojcfo",
    "ebjnf",
    "ljdif",
    "vnjcf",
    "ljosv",
    "xbjsp",
    "ibupv",
    "kpvkj",
    "hbolv",
    "njtpo",
    "cbkjo",
    "nfjgv",
    "ofibo",
    "gvsjf",
    "blbhp",
    "foufj",
    "zvvip",
    "zplpv",
    "lzpub",
    "optpv",
    "vsjlb",
    "obsbj",
    "ubupv",
    "joufj",
    "ptblj",
    "tbjcj",
    "kbllb",
    "spkjb",
    "cphfo",
    "lbjtb",
    "kjqqb",
    "tibtv",
    "zbolv",
    "ubuub",
    "kpopv",
    "cboop",
    "ubcbo",
    "tbkpv",
    "svcfo",
    "jupjo",
    "bkjup",
    "hjohb",
    "pzpcj",
    "tfj{b",
    "lpvpo",
    "tbhfo",
    "epotb",
    "czpvf",
    "sjozv",
    "uftvv",
    "b{vtb",
    "pnflp",
    "lbgvo",
    "dipcp",
    "lbtvv",
    "hjtbo",
    "ufjib",
    "nvipv",
    "nvolv",
    "czvup",
    "ubjnj",
    "kjuup",
    "jjtbp",
    "lponb",
    "zbljo",
    "lvlfj",
    "zvvzp",
    "fotij",
    "jublp",
    "qbeep",
    "lzvvj",
    "lbcpo",
    "sjqqv",
    "cvtij",
    "nbjlv",
    "lvllv",
    "ijjpo",
    "spnjp",
    "lvqpo",
    "pokvv",
    "jcjlj",
    "ibqbo",
    "ufjnv",
    "gvszp",
    "cvllp",
    "ipoqp",
    "objpv",
    "gvubj",
    "blvcb",
    "efosp",
    "ijtiv",
    "bojtv",
    "sbcbo",
    "pzbnb",
    "tivjo",
    "zbnbo",
    "divub",
    "nboob",
    "ibjop",
    "upvhp",
    "ibjnf",
    "cbsvo",
    "ojcbj",
    "ebfuf",
    "tfjkj",
    "lpvnb",
    "njllj",
    "pnpnf",
    "lvsfo",
    "nvkjo",
    "poofo",
    "njlfo",
    "blfnj",
    "jupzp",
    "tiptb",
    "hputv",
    "cbejo",
    "upsfj",
    "{vjjo",
    "hpibj",
    "lfobo",
    "lbjob",
    "b{vlj",
    "ifsfo",
    "sfhff",
    "sbttp",
    "bojnb",
    "ifjib",
    "hbsfo",
    "gvoip",
    "lbnfp",
    "sbvtv",
    "ifjsp",
    "cvsfb",
    "zvvnp",
    "tivsj",
    "nbqqv",
    "bsfcb",
    "ljcfo",
    "ppbnj",
    "cbtvo",
    "nbspv",
    "bsfop",
    "vfqpo",
    "nvvop",
    "lbjgv",
    "nvdip",
    "npblb",
    "hbolj",
    "tfljj",
    "ofjcj",
    "fjtpo",
    "ebhpo",
    "kjojo",
    "zpvlv",
    "qpb{v",
    "qvejo",
    "sj{bj",
    "zvefo",
    "fcpsb",
    "bcblv",
    "nvlbj",
    "ljttv",
    "ljlvj",
    "zvnpb",
    "ljsjo",
    "lbsbf",
    "zvvep",
    "tfkjo",
    "uboup",
    "zpvep",
    "lpsbj",
    "ojolv",
    "njnpo",
    "njjsj",
    "zplbo",
    "optij",
    "ijtfj",
    "zvvhf",
    "tpvhb",
    "ubonb",
    "phbnv",
    "ifcpo",
    "jovkj",
    "bsfcj",
    "hzphj",
    "tfosj",
    "bupnv",
    "ibubo",
    "gvnfo",
    "iblbo",
    "ebokj",
    "lptpv",
    "splpv",
    "qbohb",
    "sjejb",
    "svjij",
    "zpvbv",
    "ljoij",
    "hpohv",
    "piftp",
    "lbohb",
    "hjgvo",
    "ebfsv",
    "cpcjo",
    "lpcvj",
    "qjfub",
    "spvgv",
    "ojhvo",
    "kpzvv",
    "njofo",
    "wfspb",
    "lbplv",
    "cpvnj",
    "jxbzb",
    "sboup",
    "diplb",
    "ebjhp",
    "tpvnv",
    "hjsfj",
    "uflpv",
    "zvveb",
    "vljlj",
    "fjubj",
    "kvvbj",
    "spvpv",
    "opvlj",
    "eblfo",
    "sjojb",
    "btbhf",
    "ufljo",
    "tflpj",
    "sbuup",
    "obokj",
    "pibsj",
    "vsbnf",
    "bpcpv",
    "spsjf",
    "lfolp",
    "lpouf",
    "wbkpo",
    "{pokj",
    "dibsj",
    "svnfo",
    "ijlfo",
    "eblvv",
    "vpllb",
    "ejohp",
    "upvtb",
    "tbnfo",
    "lbhpo",
    "ibooj",
    "hfocp",
    "hblbj",
    "gvfuf",
    "qvsvo",
    "lfjgv",
    "cvufo",
    "lpnpo",
    "ibqqj",
    "kvosb",
    "ebdib",
    "kbocb",
    "ljgvv",
    "hfebj",
    "ipsvo",
    "ojocj",
    "hpvnp",
    "ftvqp",
    "opibv",
    "ptfsp",
    "sjhpv",
    "gfbsj",
    "cjpsb",
    "j{vnj",
    "upvbv",
    "kpllj",
    "tibpo",
    "obttp",
    "sfokb",
    "zpvjf",
    "cjdib",
    "gfoeb",
    "jocbj",
    "lvolb",
    "kvhfo",
    "cptij",
    "ijlfj",
    "hvgvv",
    "upsbj",
    "ipvuf",
    "tpohv",
    "ejnpo",
    "cpuup",
    "upvzp",
    "tivvf",
    "bqvsj",
    "fsvhb",
    "tipkp",
    "nfjtp",
    "ipvfj",
    "ijifj",
    "tvnjb",
    "joflb",
    "fjtfo",
    "lfolj",
    "cpvhv",
    "hpojo",
    "zptfo",
    "pnbsv",
    "jobhp",
    "hboeb",
    "zpvuf",
    "tbohj",
    "cvhfo",
    "fllfo",
    "vnbnf",
    "jxblv",
    "lpvkv",
    "objwv",
    "tivhb",
    "kptiv",
    "tbsjo",
    "sfonb",
    "epvcv",
    "xbjqv",
    "pupsj",
    "bpjsp",
    "hbonb",
    "bkjnj",
    "bqvtv",
    "bpbkj",
    "opllf",
    "tpvlf",
    "tfoep",
    "cbjjo",
    "tivbv",
    "psjkp",
    "ljoxb",
    "hjoqp",
    "cbupv",
    "bufep",
    "{fllv",
    "lfoqv",
    "kjlfj",
    "ebjib",
    "ljfeb",
    "ubjpo",
    "ebj{b",
    "zpvkv",
    "jtfsv",
    "lpjnf",
    "vnbkj",
    "{focj",
    "tfj{v",
    "bhblj",
    "hptip",
    "szveb",
    "psvup",
    "hfjlp",
    "bpjlb",
    "tij{v",
    "bsvgb",
    "psvub",
    "tboub",
    "ofnvj",
    "zpolv",
    "qvsbv",
    "sjfkv",
    "lbvnb",
    "ebjxb",
    "ufonf",
    "ebokp",
    "jsboj",
    "ifjnf",
    "{vtbo",
    "tibhv",
    "lblbp",
    "vtvsb",
    "ipvij",
    "tpdij",
    "tbgjo",
    "zvolb",
    "tbovb",
    "ifogv",
    "njohf",
    "vuflj",
    "{fnbo",
    "ifjlb",
    "bspnb",
    "divsv",
    "ljebo",
    "fsjup",
    "ljfgv",
    "vfccv",
    "kvcbo",
    "tbtpo",
    "qvuup",
    "bxbtf",
    "zpohv",
    "ublbo",
    "speep",
    "ofdib",
    "lvnpj",
    "{botb",
    "pjtib",
    "gvnbo",
    "cbufo",
    "divsf",
    "uboub",
    "kptpv",
    "ofoqj",
    "kvvoj",
    "blvnj",
    "ppbkj",
    "cbogv",
    "nbhbp",
    "vsbuf",
    "fotbo",
    "zbibj",
    "upoeb",
    "lbsvb",
    "bljsb",
    "gbllv",
    "{fokj",
    "cpljo",
    "zvvij",
    "lbjof",
    "zpvcj",
    "uboej",
    "botij",
    "fjipv",
    "bsvcj",
    "ibj{f",
    "gvvnj",
    "ojoqv",
    "zvubo",
    "kjfjo",
    "ubipv",
    "qjoub",
    "kjufj",
    "vfjcv",
    "v{vlv",
    "nbspo",
    "bsbcb",
    "lbjhp",
    "obolj",
    "kpebj",
    "ububo",
    "ubqqv",
    "ftvsv",
    "blvub",
    "btfbo",
    "ijdij",
    "qfoof",
    "izblv",
    "sboib",
    "cbohj",
    "npupo",
    "efoup",
    "ljvnj",
    "bkjep",
    "xbjlb",
    "btbtv",
    "poufj",
    "lpokj",
    "fjljo",
    "xbebj",
    "cbjvf",
    "qfspo",
    "ijhbo",
    "blfep",
    "ibjgb",
    "fosfj",
    "ojpcv",
    "opzvv",
    "lplpb",
    "pgjtb",
    "lfjhv",
    "nfuup",
    "btbof",
    "podij",
    "ipupo",
    "ifoup",
    "lfjzv",
    "iblvv",
    "lbonf",
    "sbocv",
    "vfpup",
    "vupnv",
    "fohfo",
    "ljefo",
    "ojvnv",
    "gvjlv",
    "sfjcj",
    "ufkpv",
    "tbllp",
    "hfqqv",
    "zvjnf",
    "upefo",
    "qbupo",
    "ibibp",
    "ptpsv",
    "lfpcj",
    "opspv",
    "cfzpo",
    "upplv",
    "ibnbo",
    "tflfo",
    "lbzpj",
    "ibspo",
    "hptvj",
    "dijup",
    "ifosp",
    "voifo",
    "lbgvf",
    "sjllj",
    "epeep",
    "xbolp",
    "ibuup",
    "cpoep",
    "ufohv",
    "qboeb",
    "jofeb",
    "lpvhv",
    "lb{bj",
    "bnfcb",
    "lboov",
    "{vjnj",
    "ubobo",
    "ebllp",
    "bddij",
    "epv{f",
    "kpnfj",
    "kjcbo",
    "gvtiv",
    "czvgf",
    "sfolb",
    "bljlp",
    "tivxb",
    "cbjfo",
    "ufjup",
    "hftvj",
    "epzpv",
    "hvqqj",
    "hj{fo",
    "lpvcb",
    "lp{vf",
    "ifjzv",
    "ptibo",
    "opvkv",
    "bovtv",
    "bnjcb",
    "vnjfo",
    "jovlp",
    "ibosv",
    "gfjtv",
    "ibnfo",
    "lpjkj",
    "ojhbp",
    "wjpsb",
    "fotib",
    "hpkvo",
    "tbsbj",
    "dijbo",
    "ubnfo",
    "qbttb",
    "lvhvj",
    "dijub",
    "tbjbv",
    "tijkv",
    "zpjnf",
    "offzb",
    "pkjsv",
    "bcbzb",
    "lpocj",
    "lphbj",
    "zbtib",
    "jnbnv",
    "cfj{v",
    "ofolj",
    "nfnfj",
    "jlboj",
    "tfjub",
    "xbjup",
    "kjeep",
    "vnbtf",
    "xbjeb",
    "gvebo",
    "kjpnv",
    "tivtv",
    "tbopv",
    "dijhv",
    "ofo{b",
    "gbohv",
    "lzpnv",
    "fblpo",
    "ufeep",
    "nfotv",
    "epnjf",
    "tflzp",
    "zpnfj",
    "qputv",
    "kptbo",
    "tfokj",
    "jobtf",
    "zbebo",
    "lfjnv",
    "vnbnj",
    "opccv",
    "blvtf",
    "nvuup",
    "{butv",
    "ifokb",
    "kjoob",
    "kjb{p",
    "tipsv",
    "kptvv",
    "tfsfo",
    "cjgvv",
    "qpllf",
    "kjlbj",
    "ijbup",
    "cbsjo",
    "cbjzv",
    "kplfj",
    "vdivv",
    "hjboj",
    "njjsb",
    "hpsbo",
    "opupv",
    "tijov",
    "jcfsv",
    "zvtbj",
    "iptfo",
    "ubosj",
    "njvlf",
    "gbjub",
    "lptfo",
    "iboej",
    "tvjqv",
    "wfjsv",
    "psjlj",
    "lplzv",
    "upcjo",
    "ijhfo",
    "jttfj",
    "bpjnf",
    "lftpo",
    "qfljo",
    "lfupv",
    "lfbhf",
    "ifotv",
    "kvv{b",
    "jozvv",
    "cbjlp",
    "ojipv",
    "lpiip",
    "lzbsj",
    "lpsjo",
    "lpzpj",
    "nvljo",
    "kvtiv",
    "bnbtb",
    "sfocp",
    "hbupv",
    "nbjnv",
    "zbnpp",
    "bsvhb",
    "hbjcv",
    "tfohf",
    "cpvhf",
    "nbjlp",
    "nvefo",
    "npolj",
    "nvsfj",
    "cpdij",
    "svjhp",
    "vodij",
    "spifo",
    "sjlpo",
    "hbjfo",
    "{pvhp",
    "lvolp",
    "sjlfo",
    "pqbtv",
    "sfolp",
    "spuuf",
    "gphhv",
    "ubjjo",
    "vlfuf",
    "ebkvo",
    "{bjlp",
    "jspsj",
    "{bjsj",
    "nfipv",
    "ipepv",
    "tivij",
    "ejkpo",
    "qpfnv",
    "spebo",
    "lvsfj",
    "bebop",
    "bojpo",
    "efjhp",
    "vfcbo",
    "dijkj",
    "ufufj",
    "cboub",
    "sbggb",
    "votfj",
    "svjjo",
    "tijuf",
    "nfjub",
    "vnjsp",
    "tijcp",
    "bohzb",
    "kjuub",
    "lfocj",
    "fsjbo",
    "bhvsb",
    "ufefo",
    "bnbep",
    "lpdib",
    "lfokb",
    "hpvcv",
    "fbvfj",
    "pvtij",
    "kpcff",
    "jfcbf",
    "ibjib",
    "ifjlf",
    "ovsjf",
    "ljibj",
    "foojo",
    "pzphj",
    "sjsbj",
    "sbolb",
    "jobsj",
    "lzphp",
    "ebjeb",
    "ijokb",
    "tboef",
    "ipvtv",
    "svj{v",
    "ibtvv",
    "sbokb",
    "blpep",
    "jtvub",
    "hzpgv",
    "np{{v",
    "nvnfj",
    "ibolv",
    "bhpsb",
    "epubo",
    "ojupv",
    "lpibo",
    "nfjup",
    "tijnv",
    "iboef",
    "nfubo",
    "npccv",
    "cbebj",
    "njopv",
    "objsb",
    "hbjhb",
    "jo{fj",
    "{bwjf",
    "vnjif",
    "joefo",
    "dijhj",
    "xbsbv",
    "sfhbo",
    "blbnj",
    "cbsff",
    "ob{pf",
    "plbqj",
    "jnbeb",
    "plvcb",
    "zbhbj",
    "ebjnv",
    "nbfcb",
    "dijlb",
    "ofnfb",
    "tbplb",
    "plfzb",
    "lbjvo",
    "hpofo",
    "oboup",
    "spfcf",
    "lvftb",
    "jsblv",
    "pqbsv",
    "lbllf",
    "ufjcv",
    "cvubo",
    "ublzp",
    "tbotp",
    "nftfo",
    "ipv{b",
    "bsvnj",
    "hjkpv",
    "pizpv",
    "ipllf",
    "xbtfj",
    "lbojo",
    "lblvj",
    "lfjib",
    "spcjj",
    "upvjo",
    "jtvlb",
    "gvvij",
    "wfoeb",
    "dijip",
    "lvkvv",
    "blbcb",
    "cbqqv",
    "lzpfj",
    "sphbo",
    "njsvo",
    "xbjlv",
    "bnbtv",
    "psbsv",
    "jjjsf",
    "qjolj",
    "bpupv",
    "cbllp",
    "lpgvf",
    "ibjfo",
    "pxbcj",
    "nfjhb",
    "lbjup",
    "hjnbj",
    "cjohp",
    "ubtpv",
    "tbtbv",
    "cv{bj",
    "nfhfo",
    "jupnf",
    "{bsjb",
    "sbjvo",
    "sfjup",
    "blbnf",
    "p{blv",
    "gvupo"
  ];
  var otherWords = [];

  // src/words.js
  function shiftStr(str, val) {
    let res = "";
    for (let i = 0; i < str.length; ++i) {
      let cp = str.charCodeAt(i);
      res += String.fromCodePoint(cp + val);
    }
    return res;
  }
  var Words = class {
    constructor() {
      this.allWords = new Set();
      puzzleWords.forEach((word) => this.allWords.add(word));
      otherWords.forEach((word) => this.allWords.add(word));
    }
    isAcceptableWord(word) {
      word = shiftStr(word, 1);
      return this.allWords.has(word);
    }
    getPuzzleWord(dayIx) {
      let word = puzzleWords[dayIx];
      return shiftStr(word, -1);
    }
  };

  // src/history.js
  var firstDay = new Date(2022, 0, 13, 4, 0, 0);
  function dayIndex() {
    return Math.floor(differenceInDays(new Date(), firstDay));
  }
  var History = class {
    constructor(words) {
      this.words = words;
      this.games = [];
      let gamesDataStr = localStorage.getItem("games");
      if (gamesDataStr != null) {
        let gamesData = JSON.parse(gamesDataStr);
        for (const gs of gamesData) {
          Object.setPrototypeOf(gs, Gamestate.prototype);
          gs.init();
          this.games.push(gs);
        }
      }
    }
    hasPlayed() {
      for (const gs of this.games) {
        for (const word of gs.rows) {
          if (word.length > 0)
            return true;
        }
      }
      return false;
    }
    currentGame() {
      let dayIx = dayIndex();
      for (const gs2 of this.games) {
        if (gs2.dayIx == dayIx)
          return gs2;
      }
      let gs = new Gamestate(dayIx, this.words.getPuzzleWord(dayIx));
      this.games.push(gs);
      this.save();
      return gs;
    }
    save() {
      let gamesDataStr = JSON.stringify(this.games);
      localStorage.setItem("games", gamesDataStr);
    }
    nextGameDate() {
      let now = new Date();
      if (now.getHours() < 4) {
        return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 4, 0, 0, 0);
      } else {
        let date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 4, 0, 0, 0);
        return addDays(date, 1);
      }
    }
  };

  // src/warning.js
  var Warning = class {
    constructor(elm) {
      this.elm = elm;
      this.timeoutId = null;
    }
    show(text) {
      if (this.timeoutId != null) {
        clearTimeout(this.timeoutId);
        this.timeoutId = null;
      }
      this.elm.innerText = text;
      this.elm.classList.add("visible");
      this.timeoutId = setTimeout(() => {
        this.elm.classList.remove("visible");
        this.elm.innerText = "";
      }, 1500);
    }
  };

  // src/keyboard.js
  function flashKey(elmKey) {
    elmKey.classList.add("pressed");
    setTimeout(() => elmKey.classList.remove("pressed"), 10);
  }
  var Keyboard = class {
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
      this.elm.addEventListener("click", (e) => this.onClick(e));
      document.addEventListener("keydown", (e) => this.onKeydown(e));
    }
    onClick(e) {
      if (!e.target.classList.contains("key"))
        return;
      if (e.target.classList.contains("back"))
        this.elm.dispatchEvent(new Event("back"));
      else if (e.target.classList.contains("enter"))
        this.elm.dispatchEvent(new Event("enter"));
      else {
        this.elm.dispatchEvent(new CustomEvent("letter", {
          detail: e.target.innerText.toLowerCase()
        }));
      }
      flashKey(e.target);
    }
    onKeydown(e) {
      if (e.altKey || e.ctrlKey || e.metaKey)
        return;
      if (e.key == "Enter") {
        this.elm.dispatchEvent(new Event("enter"));
        flashKey(this.elm.querySelector(".enter"));
        return;
      }
      if (e.key == "Backspace") {
        this.elm.dispatchEvent(new Event("back"));
        flashKey(this.elm.querySelector(".back"));
        return;
      }
      let key = e.key.toLowerCase();
      let elmKeys = this.elm.querySelectorAll(".key");
      for (const elmKey of elmKeys) {
        let letter = elmKey.innerText.toLowerCase();
        if (letter == key) {
          this.elm.dispatchEvent(new CustomEvent("letter", {
            detail: letter
          }));
          flashKey(elmKey);
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
        if (!mls.has(letter))
          continue;
        let ls = mls.get(letter);
        if (ls == LetterState.WrongLetter)
          elmKey.classList.add("miss");
        else if (ls == LetterState.WrongPlace)
          elmKey.classList.add("near");
        else if (ls == LetterState.RightPlace)
          elmKey.classList.add("hit");
      }
    }
  };

  // src/grid.js
  var Grid = class {
    constructor(elm, gamestate) {
      this.elm = elm;
      this.gamestate = gamestate;
      this.updateView();
      this.updateLayout();
      window.addEventListener("resize", () => this.updateLayout());
    }
    updateLayout() {
      let height = this.elm.offsetHeight;
      let vpad = 4;
      let tileSpacing = height < 300 ? 2 : 4;
      this.elm.style.paddingTop = vpad - tileSpacing + "px";
      this.elm.style.paddingBottom = 2 * vpad + "px";
      let elmRows = this.elm.querySelectorAll(".row");
      for (const elmRow of elmRows) {
        elmRow.style.padding = tileSpacing + "px";
      }
      let elmTiles = this.elm.querySelectorAll(".tile");
      let tileSize = height / 5 - 2 * vpad;
      if (tileSize > elmTiles[0].offsetHeight)
        tileSize = elmTiles[0].offsetHeight;
      for (const elmTile of elmTiles) {
        elmTile.style.width = tileSize + "px";
        elmTile.style.fontSize = Math.floor(elmTile.offsetHeight * 0.6) + "px";
        if (height < 300)
          elmTile.style.margin = "2px";
        elmTile.style.marginLeft = tileSpacing + "px";
        elmTile.style.marginRight = tileSpacing + "px";
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
          if (rowIx >= this.gamestate.rows.length)
            continue;
          if (fr == null && colIx < this.gamestate.rows[rowIx].length) {
            elmKey.innerHTML = "<span>" + this.gamestate.rows[rowIx][colIx] + "</span>";
            elmKey.classList.add("filled");
            continue;
          } else if (fr != null) {
            elmKey.innerHTML = "<span>" + fr[colIx].letter + "</span>";
            if (fr[colIx].state == LetterState.RightPlace)
              elmKey.classList.add("hit");
            else if (fr[colIx].state == LetterState.WrongPlace)
              elmKey.classList.add("near");
            else if (fr[colIx].state == LetterState.WrongLetter)
              elmKey.classList.add("miss");
          }
        }
      }
    }
  };

  // node_modules/canvas-confetti/dist/confetti.module.mjs
  var module = {};
  (function main(global, module2, isWorker, workerSize) {
    var canUseWorker = !!(global.Worker && global.Blob && global.Promise && global.OffscreenCanvas && global.OffscreenCanvasRenderingContext2D && global.HTMLCanvasElement && global.HTMLCanvasElement.prototype.transferControlToOffscreen && global.URL && global.URL.createObjectURL);
    function noop() {
    }
    function promise(func) {
      var ModulePromise = module2.exports.Promise;
      var Prom = ModulePromise !== void 0 ? ModulePromise : global.Promise;
      if (typeof Prom === "function") {
        return new Prom(func);
      }
      func(noop, noop);
      return null;
    }
    var raf = function() {
      var TIME = Math.floor(1e3 / 60);
      var frame, cancel;
      var frames = {};
      var lastFrameTime = 0;
      if (typeof requestAnimationFrame === "function" && typeof cancelAnimationFrame === "function") {
        frame = function(cb) {
          var id = Math.random();
          frames[id] = requestAnimationFrame(function onFrame(time) {
            if (lastFrameTime === time || lastFrameTime + TIME - 1 < time) {
              lastFrameTime = time;
              delete frames[id];
              cb();
            } else {
              frames[id] = requestAnimationFrame(onFrame);
            }
          });
          return id;
        };
        cancel = function(id) {
          if (frames[id]) {
            cancelAnimationFrame(frames[id]);
          }
        };
      } else {
        frame = function(cb) {
          return setTimeout(cb, TIME);
        };
        cancel = function(timer) {
          return clearTimeout(timer);
        };
      }
      return { frame, cancel };
    }();
    var getWorker = function() {
      var worker;
      var prom;
      var resolves = {};
      function decorate(worker2) {
        function execute(options, callback) {
          worker2.postMessage({ options: options || {}, callback });
        }
        worker2.init = function initWorker(canvas) {
          var offscreen = canvas.transferControlToOffscreen();
          worker2.postMessage({ canvas: offscreen }, [offscreen]);
        };
        worker2.fire = function fireWorker(options, size, done) {
          if (prom) {
            execute(options, null);
            return prom;
          }
          var id = Math.random().toString(36).slice(2);
          prom = promise(function(resolve) {
            function workerDone(msg) {
              if (msg.data.callback !== id) {
                return;
              }
              delete resolves[id];
              worker2.removeEventListener("message", workerDone);
              prom = null;
              done();
              resolve();
            }
            worker2.addEventListener("message", workerDone);
            execute(options, id);
            resolves[id] = workerDone.bind(null, { data: { callback: id } });
          });
          return prom;
        };
        worker2.reset = function resetWorker() {
          worker2.postMessage({ reset: true });
          for (var id in resolves) {
            resolves[id]();
            delete resolves[id];
          }
        };
      }
      return function() {
        if (worker) {
          return worker;
        }
        if (!isWorker && canUseWorker) {
          var code = [
            "var CONFETTI, SIZE = {}, module = {};",
            "(" + main.toString() + ")(this, module, true, SIZE);",
            "onmessage = function(msg) {",
            "  if (msg.data.options) {",
            "    CONFETTI(msg.data.options).then(function () {",
            "      if (msg.data.callback) {",
            "        postMessage({ callback: msg.data.callback });",
            "      }",
            "    });",
            "  } else if (msg.data.reset) {",
            "    CONFETTI.reset();",
            "  } else if (msg.data.resize) {",
            "    SIZE.width = msg.data.resize.width;",
            "    SIZE.height = msg.data.resize.height;",
            "  } else if (msg.data.canvas) {",
            "    SIZE.width = msg.data.canvas.width;",
            "    SIZE.height = msg.data.canvas.height;",
            "    CONFETTI = module.exports.create(msg.data.canvas);",
            "  }",
            "}"
          ].join("\n");
          try {
            worker = new Worker(URL.createObjectURL(new Blob([code])));
          } catch (e) {
            typeof console !== void 0 && typeof console.warn === "function" ? console.warn("\u{1F38A} Could not load worker", e) : null;
            return null;
          }
          decorate(worker);
        }
        return worker;
      };
    }();
    var defaults = {
      particleCount: 50,
      angle: 90,
      spread: 45,
      startVelocity: 45,
      decay: 0.9,
      gravity: 1,
      drift: 0,
      ticks: 200,
      x: 0.5,
      y: 0.5,
      shapes: ["square", "circle"],
      zIndex: 100,
      colors: [
        "#26ccff",
        "#a25afd",
        "#ff5e7e",
        "#88ff5a",
        "#fcff42",
        "#ffa62d",
        "#ff36ff"
      ],
      disableForReducedMotion: false,
      scalar: 1
    };
    function convert(val, transform) {
      return transform ? transform(val) : val;
    }
    function isOk(val) {
      return !(val === null || val === void 0);
    }
    function prop(options, name, transform) {
      return convert(options && isOk(options[name]) ? options[name] : defaults[name], transform);
    }
    function onlyPositiveInt(number) {
      return number < 0 ? 0 : Math.floor(number);
    }
    function randomInt(min, max) {
      return Math.floor(Math.random() * (max - min)) + min;
    }
    function toDecimal(str) {
      return parseInt(str, 16);
    }
    function colorsToRgb(colors) {
      return colors.map(hexToRgb);
    }
    function hexToRgb(str) {
      var val = String(str).replace(/[^0-9a-f]/gi, "");
      if (val.length < 6) {
        val = val[0] + val[0] + val[1] + val[1] + val[2] + val[2];
      }
      return {
        r: toDecimal(val.substring(0, 2)),
        g: toDecimal(val.substring(2, 4)),
        b: toDecimal(val.substring(4, 6))
      };
    }
    function getOrigin(options) {
      var origin = prop(options, "origin", Object);
      origin.x = prop(origin, "x", Number);
      origin.y = prop(origin, "y", Number);
      return origin;
    }
    function setCanvasWindowSize(canvas) {
      canvas.width = document.documentElement.clientWidth;
      canvas.height = document.documentElement.clientHeight;
    }
    function setCanvasRectSize(canvas) {
      var rect = canvas.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    }
    function getCanvas(zIndex) {
      var canvas = document.createElement("canvas");
      canvas.style.position = "fixed";
      canvas.style.top = "0px";
      canvas.style.left = "0px";
      canvas.style.pointerEvents = "none";
      canvas.style.zIndex = zIndex;
      return canvas;
    }
    function ellipse(context, x, y, radiusX, radiusY, rotation, startAngle, endAngle, antiClockwise) {
      context.save();
      context.translate(x, y);
      context.rotate(rotation);
      context.scale(radiusX, radiusY);
      context.arc(0, 0, 1, startAngle, endAngle, antiClockwise);
      context.restore();
    }
    function randomPhysics(opts) {
      var radAngle = opts.angle * (Math.PI / 180);
      var radSpread = opts.spread * (Math.PI / 180);
      return {
        x: opts.x,
        y: opts.y,
        wobble: Math.random() * 10,
        velocity: opts.startVelocity * 0.5 + Math.random() * opts.startVelocity,
        angle2D: -radAngle + (0.5 * radSpread - Math.random() * radSpread),
        tiltAngle: Math.random() * Math.PI,
        color: opts.color,
        shape: opts.shape,
        tick: 0,
        totalTicks: opts.ticks,
        decay: opts.decay,
        drift: opts.drift,
        random: Math.random() + 5,
        tiltSin: 0,
        tiltCos: 0,
        wobbleX: 0,
        wobbleY: 0,
        gravity: opts.gravity * 3,
        ovalScalar: 0.6,
        scalar: opts.scalar
      };
    }
    function updateFetti(context, fetti) {
      fetti.x += Math.cos(fetti.angle2D) * fetti.velocity + fetti.drift;
      fetti.y += Math.sin(fetti.angle2D) * fetti.velocity + fetti.gravity;
      fetti.wobble += 0.1;
      fetti.velocity *= fetti.decay;
      fetti.tiltAngle += 0.1;
      fetti.tiltSin = Math.sin(fetti.tiltAngle);
      fetti.tiltCos = Math.cos(fetti.tiltAngle);
      fetti.random = Math.random() + 5;
      fetti.wobbleX = fetti.x + 10 * fetti.scalar * Math.cos(fetti.wobble);
      fetti.wobbleY = fetti.y + 10 * fetti.scalar * Math.sin(fetti.wobble);
      var progress = fetti.tick++ / fetti.totalTicks;
      var x1 = fetti.x + fetti.random * fetti.tiltCos;
      var y1 = fetti.y + fetti.random * fetti.tiltSin;
      var x2 = fetti.wobbleX + fetti.random * fetti.tiltCos;
      var y2 = fetti.wobbleY + fetti.random * fetti.tiltSin;
      context.fillStyle = "rgba(" + fetti.color.r + ", " + fetti.color.g + ", " + fetti.color.b + ", " + (1 - progress) + ")";
      context.beginPath();
      if (fetti.shape === "circle") {
        context.ellipse ? context.ellipse(fetti.x, fetti.y, Math.abs(x2 - x1) * fetti.ovalScalar, Math.abs(y2 - y1) * fetti.ovalScalar, Math.PI / 10 * fetti.wobble, 0, 2 * Math.PI) : ellipse(context, fetti.x, fetti.y, Math.abs(x2 - x1) * fetti.ovalScalar, Math.abs(y2 - y1) * fetti.ovalScalar, Math.PI / 10 * fetti.wobble, 0, 2 * Math.PI);
      } else {
        context.moveTo(Math.floor(fetti.x), Math.floor(fetti.y));
        context.lineTo(Math.floor(fetti.wobbleX), Math.floor(y1));
        context.lineTo(Math.floor(x2), Math.floor(y2));
        context.lineTo(Math.floor(x1), Math.floor(fetti.wobbleY));
      }
      context.closePath();
      context.fill();
      return fetti.tick < fetti.totalTicks;
    }
    function animate(canvas, fettis, resizer, size, done) {
      var animatingFettis = fettis.slice();
      var context = canvas.getContext("2d");
      var animationFrame;
      var destroy;
      var prom = promise(function(resolve) {
        function onDone() {
          animationFrame = destroy = null;
          context.clearRect(0, 0, size.width, size.height);
          done();
          resolve();
        }
        function update() {
          if (isWorker && !(size.width === workerSize.width && size.height === workerSize.height)) {
            size.width = canvas.width = workerSize.width;
            size.height = canvas.height = workerSize.height;
          }
          if (!size.width && !size.height) {
            resizer(canvas);
            size.width = canvas.width;
            size.height = canvas.height;
          }
          context.clearRect(0, 0, size.width, size.height);
          animatingFettis = animatingFettis.filter(function(fetti) {
            return updateFetti(context, fetti);
          });
          if (animatingFettis.length) {
            animationFrame = raf.frame(update);
          } else {
            onDone();
          }
        }
        animationFrame = raf.frame(update);
        destroy = onDone;
      });
      return {
        addFettis: function(fettis2) {
          animatingFettis = animatingFettis.concat(fettis2);
          return prom;
        },
        canvas,
        promise: prom,
        reset: function() {
          if (animationFrame) {
            raf.cancel(animationFrame);
          }
          if (destroy) {
            destroy();
          }
        }
      };
    }
    function confettiCannon(canvas, globalOpts) {
      var isLibCanvas = !canvas;
      var allowResize = !!prop(globalOpts || {}, "resize");
      var globalDisableForReducedMotion = prop(globalOpts, "disableForReducedMotion", Boolean);
      var shouldUseWorker = canUseWorker && !!prop(globalOpts || {}, "useWorker");
      var worker = shouldUseWorker ? getWorker() : null;
      var resizer = isLibCanvas ? setCanvasWindowSize : setCanvasRectSize;
      var initialized = canvas && worker ? !!canvas.__confetti_initialized : false;
      var preferLessMotion = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion)").matches;
      var animationObj;
      function fireLocal(options, size, done) {
        var particleCount = prop(options, "particleCount", onlyPositiveInt);
        var angle = prop(options, "angle", Number);
        var spread = prop(options, "spread", Number);
        var startVelocity = prop(options, "startVelocity", Number);
        var decay = prop(options, "decay", Number);
        var gravity = prop(options, "gravity", Number);
        var drift = prop(options, "drift", Number);
        var colors = prop(options, "colors", colorsToRgb);
        var ticks = prop(options, "ticks", Number);
        var shapes = prop(options, "shapes");
        var scalar = prop(options, "scalar");
        var origin = getOrigin(options);
        var temp = particleCount;
        var fettis = [];
        var startX = canvas.width * origin.x;
        var startY = canvas.height * origin.y;
        while (temp--) {
          fettis.push(randomPhysics({
            x: startX,
            y: startY,
            angle,
            spread,
            startVelocity,
            color: colors[temp % colors.length],
            shape: shapes[randomInt(0, shapes.length)],
            ticks,
            decay,
            gravity,
            drift,
            scalar
          }));
        }
        if (animationObj) {
          return animationObj.addFettis(fettis);
        }
        animationObj = animate(canvas, fettis, resizer, size, done);
        return animationObj.promise;
      }
      function fire(options) {
        var disableForReducedMotion = globalDisableForReducedMotion || prop(options, "disableForReducedMotion", Boolean);
        var zIndex = prop(options, "zIndex", Number);
        if (disableForReducedMotion && preferLessMotion) {
          return promise(function(resolve) {
            resolve();
          });
        }
        if (isLibCanvas && animationObj) {
          canvas = animationObj.canvas;
        } else if (isLibCanvas && !canvas) {
          canvas = getCanvas(zIndex);
          document.body.appendChild(canvas);
        }
        if (allowResize && !initialized) {
          resizer(canvas);
        }
        var size = {
          width: canvas.width,
          height: canvas.height
        };
        if (worker && !initialized) {
          worker.init(canvas);
        }
        initialized = true;
        if (worker) {
          canvas.__confetti_initialized = true;
        }
        function onResize() {
          if (worker) {
            var obj = {
              getBoundingClientRect: function() {
                if (!isLibCanvas) {
                  return canvas.getBoundingClientRect();
                }
              }
            };
            resizer(obj);
            worker.postMessage({
              resize: {
                width: obj.width,
                height: obj.height
              }
            });
            return;
          }
          size.width = size.height = null;
        }
        function done() {
          animationObj = null;
          if (allowResize) {
            global.removeEventListener("resize", onResize);
          }
          if (isLibCanvas && canvas) {
            document.body.removeChild(canvas);
            canvas = null;
            initialized = false;
          }
        }
        if (allowResize) {
          global.addEventListener("resize", onResize, false);
        }
        if (worker) {
          return worker.fire(options, size, done);
        }
        return fireLocal(options, size, done);
      }
      fire.reset = function() {
        if (worker) {
          worker.reset();
        }
        if (animationObj) {
          animationObj.reset();
        }
      };
      return fire;
    }
    module2.exports = confettiCannon(null, { useWorker: true, resize: true });
    module2.exports.create = confettiCannon;
  })(function() {
    if (typeof window !== "undefined") {
      return window;
    }
    if (typeof self !== "undefined") {
      return self;
    }
    return this || {};
  }(), module, false);
  var confetti_module_default = module.exports;
  var create = module.exports.create;

  // src/test.js
  var t = {
    error: function(msg) {
      console.log("Error: " + msg);
      throw "Test failed.";
    }
  };
  if (!window.test) {
    window.test = function() {
      if (!window.tests) {
        console.log("Done: window.tests array not declared");
        return;
      }
      if (window.tests.length == 0) {
        console.log("Done: window.tests array has no functions");
        return;
      }
      for (const test of window.tests) {
        console.log("Executing: " + test.name);
        try {
          test(t);
        } catch (e) {
          console.log(e);
        }
      }
    };
  }
  if (!window.tests)
    window.tests = [];

  // src/gamestate.test.js
  var guesses1 = [
    { word: "csibe", wrongLetter: "csie", wrongPlace: "b", good: "" },
    { word: "opera", wrongLetter: "csieopr", wrongPlace: "ba", good: "" },
    { word: "rumba", wrongLetter: "csieopru", wrongPlace: "ba", good: "m" },
    { word: "tarot", wrongLetter: "csieoprut", wrongPlace: "b", good: "ma" },
    { word: "burok", wrongLetter: "csieoprutk", wrongPlace: "", good: "mab" },
    { word: "bamba", wrongLetter: "csieoprutk", wrongPlace: "", good: "mab" }
  ];
  var guesses2 = [
    { word: "tarot", wrongLetter: "tro", wrongPlace: "a", good: "" },
    { word: "burok", wrongLetter: "trouk", wrongPlace: "ab", good: "" },
    { word: "csibe", wrongLetter: "troukcsie", wrongPlace: "a", good: "b" },
    { word: "opera", wrongLetter: "troukcsieop", wrongPlace: "", good: "ab" },
    { word: "rumba", wrongLetter: "troukcsieop", wrongPlace: "", good: "abm" },
    { word: "bamba", wrongLetter: "troukcsieop", wrongPlace: "", good: "abm" }
  ];
  function isMarkingRight(t2, markedLetters, expectedWrongLetter, expectedWrongPlace, expectedGood) {
    let expectedWrongLetterSet = strToSet(expectedWrongLetter);
    let expectedWrongPlaceSet = strToSet(expectedWrongPlace);
    let expectedGoodSet = strToSet(expectedGood);
    let wrongLetterSet = new Set();
    let wrongPlaceSet = new Set();
    let goodSet = new Set();
    markedLetters.forEach((state, letter) => {
      if (state == LetterState.WrongLetter)
        wrongLetterSet.add(letter);
      else if (state == LetterState.WrongPlace)
        wrongPlaceSet.add(letter);
      else if (state == LetterState.RightPlace)
        goodSet.add(letter);
    });
    if (!eqSet(expectedWrongLetterSet, wrongLetterSet))
      t2.error("Expected wrong letters '" + expectedWrongLetter + "', got '" + [...wrongLetterSet] + "'");
    if (!eqSet(expectedWrongPlaceSet, wrongPlaceSet))
      t2.error("Expected wrong place '" + expectedWrongPlace + "', got '" + [...wrongPlaceSet] + "'");
    if (!eqSet(expectedGoodSet, goodSet))
      t2.error("Expected good '" + expectedGood + "', got '" + [...goodSet] + "'");
  }
  function strToSet(str) {
    let res = new Set();
    for (let i = 0; i < str.length; ++i)
      res.add(str[i]);
    return res;
  }
  function eqSet(as, bs) {
    if (as.size !== bs.size)
      return false;
    for (var a of as)
      if (!bs.has(a))
        return false;
    return true;
  }
  function genTestMarkedLetters(solution, guesses) {
    function testMarkedLetters(t2) {
      let gs = new Gamestate(0, solution);
      for (const guess of guesses) {
        for (let i = 0; i < guess.word.length; ++i)
          gs.addLetter(guess.word[i]);
        gs.commitWord();
        let mls = gs.getMarkedLetters();
        isMarkingRight(t2, mls, guess.wrongLetter, guess.wrongPlace, guess.good);
      }
    }
    return testMarkedLetters;
  }
  window.tests.push(genTestMarkedLetters("bamba", guesses1));
  window.tests.push(genTestMarkedLetters("bamba", guesses2));

  // src/app.js
  var theReloader = new Reloader();
  var theSettings = new Settings();
  var theWords;
  var theHistory;
  var theApp;
  setDarkLightClass();
  document.addEventListener("DOMContentLoaded", () => {
    let timeVal = new Date().getTime();
    if (timeVal % 10 == 0)
      plausible();
    theWords = new Words();
    theHistory = new History(theWords);
    theApp = new App(false);
  });
  var T = {
    title: "\u3069\u3046\u3082! Wordle\u306E\u65E5\u672C\u8A9E\u30D0\u30FC\u30B8\u30E7\u30F3",
    tooFewLetters: "\u6587\u5B57\u304C\u8DB3\u308A\u307E\u305B\u3093\u3088",
    unknownWord: "\u3042\u3063\n\u305D\u306E\u5358\u8A9E\u306F\u8F9E\u66F8\u306B\u3042\u308A\u307E\u305B\u3093\u3088\uFF01",
    congrats: "\u304A\u3081\u3067\u3068\u3046\u3054\u3056\u3044\u307E\u3059\uFF01",
    puzzleSuccess: "${day}\u3064\u76EE\u306E\u30D1\u30BA\u30EB\u3092\u5B8C\u6210\u3057\u307E\u3057\u305F\uFF01",
    puzzleFail: "${day}\u3064\u76EE\u306E\u30D1\u30BA\u30EB\u306B\u8CA0\u3051\u3066\u3057\u307E\u3044\u307E\u3057\u305F\uFF01",
    shareClipboard: "\u30AF\u30EA\u30C3\u30D7\u30DC\u30FC\u30C9\u306B\u30B3\u30D4\u30FC\u3057\u307E\u3057\u305F\uFF01",
    shareText: "\u65E5\u672C\u8A9E\u306EWordle\uFF08\u30ED\u30FC\u30DE\u5B57\uFF09\n#{day}\n{guesses}/6\nhttps://wordle-jp.netlify.app/\n"
  };
  var App = class {
    constructor(testing) {
      this.gamestate = null;
      if (testing)
        this.initForTest();
      else
        this.initFromHistory();
      this.warning = new Warning(document.getElementsByTagName("aside")[0]);
      this.keyboard = new Keyboard(document.getElementById("keyboard"), this.gamestate);
      this.grid = new Grid(document.getElementById("grid"), this.gamestate);
      this.keyboard.onLetter((e) => this.onLetter(e));
      this.keyboard.onBack((e) => this.onBack());
      this.keyboard.onEnter((e) => this.onEnter());
      this.gamestate.onGamestateChanged(() => this.onGamestateChanged());
      this.initPopup();
      this.initShare();
      this.initSettings();
      if (this.gamestate.isFinished())
        this.showStatus();
      else if (!theHistory.hasPlayed())
        this.showInfo();
    }
    initPopup() {
      let elmPopup = document.getElementsByTagName("article")[0];
      document.getElementById("showInfo").addEventListener("click", () => {
        this.showInfo();
      });
      document.getElementById("showSettings").addEventListener("click", () => {
        this.showSettings();
      });
      if (this.gamestate.isFinished()) {
        document.getElementById("showStatus").classList.add("visible");
      }
      document.getElementById("showStatus").addEventListener("click", () => {
        if (!this.gamestate.isFinished())
          return;
        this.showStatus();
      });
      elmPopup.addEventListener("click", (e) => {
        if (e.target.tagName != "BUTTON" || !e.target.classList.contains("close"))
          return;
        this.closePopup();
      });
    }
    closePopup() {
      let elmPopup = document.getElementsByTagName("article")[0];
      let elmSections = elmPopup.querySelectorAll("section");
      elmSections.forEach((elm) => elm.classList.remove("visible"));
      elmPopup.classList.remove("visible");
      if (this.countdownIntervalId) {
        clearInterval(this.countdownIntervalId);
        this.countdownIntervalId = null;
      }
    }
    initShare() {
      document.getElementById("shareGeneral").addEventListener("click", () => {
        let msg = T.shareText;
        msg = msg.replace("{day}", this.gamestate.dayIx);
        if (this.gamestate.isSolved())
          msg = msg.replace("{guesses}", this.gamestate.finishedRows);
        else
          msg = msg.replace("{guesses}", "X");
        let darkMode = theSettings.displayMode == DisplayMode.Dark;
        let constrastColors = theSettings.colorScheme == ColorScheme.BlueOrange;
        msg += this.gamestate.getShareText(darkMode, constrastColors);
        if (navigator.share) {
          navigator.share({
            title: T.title,
            text: msg
          }).then(() => {
          }).catch();
        } else {
          navigator.clipboard.writeText(msg);
          this.warning.show(T.shareClipboard);
        }
      });
    }
    initSettings() {
      let elmDLSetting = document.getElementById("darkLightSetting");
      if (theSettings.getDisplayMode() == DisplayMode.Dark)
        elmDLSetting.classList.add("darkMode");
      else
        elmDLSetting.classList.add("lightMode");
      elmDLSetting.addEventListener("click", () => {
        if (elmDLSetting.classList.contains("darkMode")) {
          elmDLSetting.classList.remove("darkMode");
          elmDLSetting.classList.add("lightMode");
          theSettings.setDisplayMode(DisplayMode.Light);
          setDarkLightClass();
        } else {
          elmDLSetting.classList.remove("lightMode");
          elmDLSetting.classList.add("darkMode");
          theSettings.setDisplayMode(DisplayMode.Dark);
          setDarkLightClass();
        }
      });
      let elmCSSetting = document.getElementById("colorSchemeSetting");
      if (theSettings.getColorScheme() == ColorScheme.RedGreen) {
        elmCSSetting.querySelector("#colorsRedGreen").checked = true;
      } else {
        elmCSSetting.querySelector("#colorsBlueOrange").checked = true;
        document.documentElement.classList.add("contrast");
      }
      let radios = elmCSSetting.querySelectorAll("input[type=radio]");
      radios.forEach((radio) => radio.addEventListener("change", (e) => {
        if (elmCSSetting.querySelector("#colorsRedGreen").checked) {
          document.documentElement.classList.remove("contrast");
          theSettings.setColorScheme(ColorScheme.RedGreen);
        } else {
          document.documentElement.classList.add("contrast");
          theSettings.setColorScheme(ColorScheme.BlueOrange);
        }
      }));
    }
    showSettings() {
      this.closePopup();
      let elmPopup = document.getElementsByTagName("article")[0];
      elmPopup.querySelector("#settingsPopup").classList.add("visible");
      elmPopup.classList.add("visible");
    }
    showInfo() {
      this.closePopup();
      let elmPopup = document.getElementsByTagName("article")[0];
      let infoStr = "dbdb";
      let elmAppScript = document.getElementById("app-js");
      let reHash = new RegExp("\\?v=(.{4})");
      let m = reHash.exec(elmAppScript.src);
      if (m)
        infoStr = m[1];
      infoStr = "#" + this.gamestate.dayIx + " " + infoStr;
      elmPopup.querySelector("#info").innerText = infoStr;
      elmPopup.querySelector("#infoPopup").classList.add("visible");
      elmPopup.classList.add("visible");
    }
    showStatus() {
      this.closePopup();
      let elmPopup = document.getElementsByTagName("article")[0];
      let elmStatusMsg = document.getElementById("statusMsg");
      let elmTimeLeft = document.getElementById("timeLeft");
      let dayIx = this.gamestate.dayIx;
      let msg = this.gamestate.isSolved() ? T.puzzleSuccess.replace("${day}", dayIx) : T.puzzleFail.replace("${day}", dayIx);
      elmStatusMsg.innerText = msg;
      elmPopup.querySelector("#statusPopup").classList.add("visible");
      elmPopup.classList.add("visible");
      let darkMode = theSettings.displayMode == DisplayMode.Dark;
      let constrastColors = theSettings.colorScheme == ColorScheme.BlueOrange;
      elmPopup.querySelector("#sharePreview").innerHTML = "<span>" + this.gamestate.getShareText(darkMode, constrastColors) + "</span>";
      let nextDate = theHistory.nextGameDate();
      updateCounter();
      this.countdownIntervalId = setInterval(updateCounter, 50);
      function updateCounter() {
        let dateNow = new Date();
        let seconds = Math.floor((nextDate - dateNow) / 1e3);
        let minutes = Math.floor(seconds / 60);
        let hours = Math.floor(minutes / 60);
        let days = Math.floor(hours / 24);
        hours = hours - days * 24;
        minutes = minutes - days * 24 * 60 - hours * 60;
        seconds = seconds - days * 24 * 60 * 60 - hours * 60 * 60 - minutes * 60;
        hours = String(hours).padStart(2, "0");
        minutes = String(minutes).padStart(2, "0");
        seconds = String(seconds).padStart(2, "0");
        elmTimeLeft.innerText = `${hours}\u200B:${minutes}\u200B:${seconds}`;
      }
    }
    onGamestateChanged() {
      this.keyboard.updateView();
      this.grid.updateView();
      theHistory.save();
    }
    onEnter() {
      let activeWord = this.gamestate.getActiveWord();
      if (activeWord == null)
        return;
      if (activeWord.length < 5) {
        this.warning.show(T.tooFewLetters);
        return;
      }
      if (!theWords.isAcceptableWord(activeWord)) {
        this.warning.show(T.unknownWord);
        return;
      }
      this.gamestate.commitWord();
      if (!this.gamestate.isFinished())
        return;
      if (this.gamestate.isSolved()) {
        setTimeout(doConfetti, 10);
        this.warning.show(T.congrats);
      } else {
        this.warning.show(this.gamestate.solution.toUpperCase());
      }
      setTimeout(() => {
        document.getElementById("showStatus").classList.add("visible");
        this.showStatus();
      }, 2e3);
    }
    onBack() {
      let activeWord = this.gamestate.getActiveWord();
      if (activeWord == null)
        return;
      if (activeWord.length == 0)
        return;
      this.gamestate.removeLetter();
    }
    onLetter(e) {
      let activeWord = this.gamestate.getActiveWord();
      if (activeWord == null)
        return;
      if (activeWord.length >= 5)
        return;
      this.gamestate.addLetter(e.detail);
    }
    initForTest() {
      let dayIx = theHistory.dayIndex();
      this.gamestate = new Gamestate(dayIx, theWords.getPuzzleWord(dayIx));
    }
    initFromHistory() {
      this.gamestate = theHistory.currentGame();
    }
  };
  function doConfetti() {
    setTimeout(() => {
      confetti_module_default();
    }, 10);
  }
  function setDarkLightClass() {
    if (theSettings.getDisplayMode() == DisplayMode.Dark) {
      document.documentElement.classList.remove("light");
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
    }
  }
})();
//# sourceMappingURL=app.js.map
