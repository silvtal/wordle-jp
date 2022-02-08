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
    "cpvcj",
    "ipozb",
    "tbj{v",
    "fqpob",
    "blbcb",
    "xbjsj",
    "fsvcp",
    "ufljj",
    "tbtfo",
    "hfuup",
    "fjubo",
    "lbqqv",
    "tvjup",
    "{folb",
    "ifotv",
    "tbnpo",
    "jsvlb",
    "kvotb",
    "ifjib",
    "hptpv",
    "cbjsv",
    "nvolv",
    "kvfsj",
    "lfjcp",
    "lflbo",
    "szvvj",
    "uposf",
    "tbufj",
    "ijspj",
    "nfufo",
    "lpokj",
    "lpjlb",
    "sjlpo",
    "njuup",
    "upqqj",
    "tbzvv",
    "nj{vp",
    "ipszp",
    "lpvlj",
    "ljfuf",
    "jubnp",
    "ojhbp",
    "cputv",
    "ptfkj",
    "zptpv",
    "cveeb",
    "qvsbo",
    "szvsj",
    "sf{vo",
    "zpvhv",
    "iblbj",
    "bnjnf",
    "vtvsb",
    "ifcvo",
    "pkjhj",
    "lbubo",
    "{fosb",
    "ojozb",
    "cpvnv",
    "uboej",
    "divob",
    "kj{fo",
    "tivfo",
    "pepsv",
    "ufjbo",
    "lpopv",
    "kpvhj",
    "kbkkj",
    "ubhvv",
    "sboob",
    "hfoep",
    "btbhf",
    "upvcb",
    "zpufj",
    "bebkp",
    "opsfo",
    "ofsbv",
    "tivzv",
    "tbsbj",
    "joxbj",
    "lvjsv",
    "epsbj",
    "ufjsj",
    "fsfcf",
    "ibotb",
    "tfkjo",
    "ijxbj",
    "lbpsv",
    "tivvf",
    "bkjup",
    "bsfop",
    "ljocj",
    "lfllj",
    "spnfo",
    "nbkbo",
    "tblbj",
    "nfjgv",
    "ipvij",
    "lbtfj",
    "diftv",
    "nvhfo",
    "kjeeb",
    "ibspv",
    "hpohf",
    "lbolv",
    "gbjsv",
    "bddij",
    "bcbsb",
    "lfjgv",
    "boobo",
    "ljcbo",
    "tbjhb",
    "ptijf",
    "lblbp",
    "blbkj",
    "tfoqv",
    "vlfbv",
    "lvibj",
    "zbnpp",
    "sbqqv",
    "tfohv",
    "peplf",
    "vefxb",
    "gbjub",
    "nbsvj",
    "vlbtv",
    "ufoef",
    "hpibj",
    "ljolv",
    "cvtvj",
    "cvozb",
    "tfokp",
    "hftij",
    "ufoop",
    "jokvo",
    "ufjnv",
    "kpvup",
    "tfjgv",
    "ljsjo",
    "joubj",
    "lblvv",
    "ibosp",
    "svoep",
    "lpvcp",
    "ljupo",
    "tijbj",
    "bopnj",
    "vlfbj",
    "lbjsj",
    "ebvjo",
    "hfljj",
    "ljolp",
    "cpvsv",
    "lbjzv",
    "lvvlj",
    "ljllb",
    "ofjwj",
    "vjuup",
    "sbttp",
    "kjolb",
    "kvokp",
    "fobkj",
    "tijkv",
    "jttij",
    "puphj",
    "ljepv",
    "bupsj",
    "ipvgv",
    "joefo",
    "lbjhj",
    "cboop",
    "tvxbo",
    "hbocp",
    "vnflj",
    "ebjnf",
    "lpvhv",
    "ublfj",
    "upohv",
    "nbgjb",
    "hfjlp",
    "lvsvv",
    "gvspb",
    "gbllv",
    "kjcpv",
    "tpvlf",
    "hbjtv",
    "tibnv",
    "tptfo",
    "ojipv",
    "lb{fo",
    "ojkvv",
    "nvdib",
    "lfolv",
    "ijgvo",
    "diflp",
    "tbsbv",
    "sjqfb",
    "gvjlv",
    "iblfj",
    "sfllb",
    "szvup",
    "epeep",
    "cbebj",
    "qbveb",
    "gvhfo",
    "hpvsv",
    "lfosj",
    "pupnp",
    "pzbnb",
    "tbufo",
    "cbcpo",
    "cfoep",
    "upllj",
    "tboub",
    "nfjzb",
    "lboov",
    "nj{pv",
    "hpiip",
    "epzpv",
    "ebllp",
    "tfubj",
    "vnjsp",
    "pupob",
    "hbcpv",
    "sjnfo",
    "fjtpv",
    "ifjsp",
    "zpzvv",
    "jtipv",
    "opvlj",
    "pzpcv",
    "fozpv",
    "ibjfo",
    "tivub",
    "sbhvo",
    "{bsjb",
    "jflzp",
    "nvlvv",
    "tvlpo",
    "sbttb",
    "ijbup",
    "tfosj",
    "hvoup",
    "tvqjo",
    "sbjzv",
    "fjnjo",
    "votpv",
    "ipuup",
    "lfobo",
    "ofnfb",
    "ufnbf",
    "kptvv",
    "jcblv",
    "lvsjo",
    "hb{pv",
    "nvtij",
    "jcjsv",
    "tphbo",
    "ebjgv",
    "nboup",
    "sbdib",
    "ljokj",
    "bpjsp",
    "uplfj",
    "cbjuf",
    "qjolj",
    "sjohb",
    "jfepv",
    "tivjo",
    "ijhbo",
    "sjzpv",
    "tbjgv",
    "{vopv",
    "fotbo",
    "tpojo",
    "zbcbo",
    "fljlb",
    "qbsjb",
    "bopep",
    "jkblv",
    "qfjtv",
    "iboep",
    "blvcb",
    "ijcpv",
    "bojpo",
    "ljtij",
    "njjsj",
    "nvsvj",
    "pvlbo",
    "lvnjo",
    "ubobo",
    "ebjeb",
    "sfjej",
    "nvipv",
    "jxbsf",
    "bjlpo",
    "npfsv",
    "cbolv",
    "zpvhb",
    "lbjxb",
    "tijhj",
    "b{bnj",
    "lppoj",
    "iblvb",
    "pvkpv",
    "nbuup",
    "bsbuf",
    "upttb",
    "lfjtv",
    "bjkjo",
    "tbjib",
    "tbokj",
    "upo{b",
    "psjbv",
    "lzplf",
    "fljtv",
    "kjoub",
    "zblbo",
    "nftfo",
    "lpvcf",
    "fjufo",
    "kjtip",
    "ebfsv",
    "ebjhp",
    "lbufo",
    "hbutv",
    "sbufo",
    "jnjbj",
    "opspv",
    "ebsjo",
    "zvtbj",
    "ljtpj",
    "upoup",
    "spcbo",
    "kpvbj",
    "ubooj",
    "sfjlb",
    "kjjnb",
    "hjnbj",
    "ufvtv",
    "dijip",
    "lbllj",
    "jubnj",
    "{vllv",
    "ibkkj",
    "folbo",
    "gvllj",
    "ojdij",
    "jqqbo",
    "ibjgv",
    "kjebj",
    "qbupo",
    "ubjjo",
    "hftfo",
    "puptv",
    "podij",
    "qjuup",
    "lpjnf",
    "vsjvf",
    "njcbf",
    "j{vnj",
    "jttvj",
    "ifjjf",
    "pvhpo",
    "jcbsj",
    "tipsv",
    "hvsjo",
    "svjlb",
    "lvlbo",
    "fsfsv",
    "tijup",
    "tptpv",
    "psfsv",
    "lvutv",
    "cfoeb",
    "vlbcv",
    "vuflj",
    "pljzb",
    "epv{f",
    "pnplj",
    "kpopv",
    "utvof",
    "gvsjf",
    "ubttp",
    "kbhpo",
    "nfjub",
    "tijcv",
    "kptfj",
    "hbjij",
    "vfjub",
    "ubqjo",
    "lfokj",
    "lpouf",
    "njjsb",
    "lpdib",
    "ijdij",
    "kpvzp",
    "gvonf",
    "lvsbv",
    "ebjlj",
    "sfjop",
    "tijjo",
    "kvijo",
    "ubjnf",
    "gvflj",
    "lzplb",
    "hzbhv",
    "kvhpv",
    "jlzpv",
    "lbjij",
    "ibjop",
    "bojkb",
    "tvjlp",
    "jnbkv",
    "fohfj",
    "tbuup",
    "qbvsj",
    "utvnf",
    "opvoj",
    "upqqv",
    "lfosv",
    "lfupo",
    "npnfo",
    "diblv",
    "{bwjf",
    "ubcbo",
    "utvzv",
    "ppbsf",
    "cbggb",
    "tfjcv",
    "joupo",
    "ebkvo",
    "wfjsv",
    "lbupv",
    "kpv{v",
    "lzplj",
    "spupv",
    "jttpv",
    "hbolj",
    "lbebo",
    "sfjqv",
    "bplbj",
    "nbfif",
    "pljnf",
    "dibsj",
    "upqqb",
    "tvlvv",
    "ojuup",
    "ufkvo",
    "czpvv",
    "vubhf",
    "blvub",
    "kjhbj",
    "ptvsv",
    "lbocj",
    "lbjjo",
    "sfjup",
    "ljuuf",
    "efczv",
    "lpvsp",
    "ebnjo",
    "hjnpo",
    "peblv",
    "hpipo",
    "lbhpv",
    "ipvsj",
    "qfljo",
    "npolj",
    "pohvv",
    "vfqpo",
    "kvotv",
    "bufof",
    "tpkpv",
    "ppljj",
    "bcvsb",
    "difjo",
    "nfjcp",
    "spvuf",
    "ubllb",
    "zvvfj",
    "lvobo",
    "zvvxb",
    "eptfj",
    "opvsj",
    "lbjlj",
    "ubjsv",
    "tvhpj",
    "lbhpo",
    "lfdij",
    "hpkvv",
    "{folv",
    "tvjqv",
    "sfopo",
    "upcjp",
    "cbjup",
    "jtvub",
    "jbokp",
    "ibjcv",
    "lblvj",
    "kbllj",
    "jsfcb",
    "lvllj",
    "bsblb",
    "lfouf",
    "ovlvj",
    "hpvlb",
    "ifjxb",
    "lpvhp",
    "zbupj",
    "hpnfo",
    "pnj{v",
    "tfokj",
    "tpipv",
    "{botb",
    "poofo",
    "hbvtv",
    "tbspo",
    "zpvup",
    "cpvlj",
    "bnjsv",
    "epvjo",
    "fjtfj",
    "bubnb",
    "spvij",
    "tvjep",
    "cbjeb",
    "nposp",
    "spkjf",
    "bqjsv",
    "lvtij",
    "ojotp",
    "tijlv",
    "cbjvf",
    "kp{bo",
    "cbo{v",
    "gjohb",
    "{fvtv",
    "tvqvo",
    "bnbtb",
    "nbfop",
    "bojlj",
    "dijhp",
    "spsfo",
    "ubjup",
    "zbtvj",
    "ebutv",
    "ibolv",
    "bnbub",
    "tpvjo",
    "ij{pv",
    "spkjb",
    "kvosj",
    "sjuub",
    "foupv",
    "lbjof",
    "ebupv",
    "lbllf",
    "hfolb",
    "fuptv",
    "gvoip",
    "gvhpv",
    "foqpv",
    "nfjtp",
    "nfdib",
    "pvdij",
    "flvtv",
    "gfjep",
    "kjhfo",
    "tibfj",
    "bzbtv",
    "oflbo",
    "nvlpv",
    "cjdib",
    "jtbnj",
    "npccv",
    "ubnfo",
    "lbhfo",
    "ibdij",
    "jtfsv",
    "sjufo",
    "tvvkj",
    "bsvsv",
    "zvsbj",
    "qbokp",
    "tbotp",
    "njohf",
    "lbolb",
    "lfkpv",
    "cbsff",
    "zpvuf",
    "ebsjb",
    "hjljo",
    "ljifj",
    "nzv{v",
    "ufohj",
    "ljtiv",
    "hplfj",
    "foqfo",
    "qpllf",
    "utvsj",
    "hvnbj",
    "oboqb",
    "ubjsb",
    "zvsvj",
    "bsvup",
    "cjtbv",
    "pjtib",
    "ijttv",
    "ofutv",
    "vnbsf",
    "nvjbv",
    "blvtp",
    "lfibj",
    "upupv",
    "epvlb",
    "zpspo",
    "qfjqb",
    "ijubo",
    "cfo{b",
    "nfttf",
    "ijnfo",
    "iplpv",
    "ojllb",
    "tijnv",
    "gfoeb",
    "qpvsv",
    "hpkpv",
    "kvubj",
    "lpoxb",
    "hfonj",
    "upvbv",
    "spvgv",
    "tpvtb",
    "lpflj",
    "lpllv",
    "{bjlb",
    "nvkpv",
    "sbllj",
    "npsbv",
    "hffnv",
    "kpspo",
    "tbllb",
    "objzb",
    "tijcp",
    "ubllv",
    "bsjtb",
    "ljlfo",
    "blvnb",
    "ijotp",
    "ibnpo",
    "qjsfo",
    "tftiv",
    "qvsjo",
    "hj{pv",
    "nvhbj",
    "cbsvo",
    "tvkpv",
    "sjutv",
    "hjipv",
    "lbljo",
    "tbjlv",
    "lfjkv",
    "tvkjj",
    "zpblf",
    "tvvlj",
    "pkplv",
    "spvpv",
    "kjsbj",
    "zvvhf",
    "sfjep",
    "foplj",
    "jupzp",
    "lzphp",
    "ebubj",
    "ipokj",
    "lpufo",
    "npebf",
    "lponf",
    "lpvhb",
    "tfjbj",
    "vobhj",
    "zbkpv",
    "splfo",
    "bljsb",
    "epubo",
    "jnbeb",
    "vfufo",
    "hvuup",
    "bcfsv",
    "tbjcj",
    "cphfo",
    "epv{p",
    "cjnjj",
    "lfofo",
    "nfnbj",
    "plvsb",
    "lbifj",
    "sfjfo",
    "butvj",
    "upjub",
    "ubhpo",
    "ibfsv",
    "kvutv",
    "{bipo",
    "qfohb",
    "foebj",
    "ipvlp",
    "{pokj",
    "qjdij",
    "bsbnp",
    "obebj",
    "ojolj",
    "pvcpv",
    "vxbtb",
    "gvhvv",
    "xbjlv",
    "tbo{v",
    "ifjlb",
    "tblvj",
    "hjjuf",
    "hjbob",
    "lvsjb",
    "utvnj",
    "fsflj",
    "ibjlp",
    "plvep",
    "bobcb",
    "ufjnj",
    "ebcbo",
    "lftpo",
    "ufonb",
    "ipvjo",
    "tijnj",
    "jocbj",
    "ijutv",
    "{bjsv",
    "ufjkj",
    "fhvsv",
    "ubjbo",
    "zbpzb",
    "tvfhv",
    "dijxb",
    "foubj",
    "voufo",
    "jiblv",
    "poubj",
    "hbjsp",
    "tbzpv",
    "tbohj",
    "epnjf",
    "sfokb",
    "ljtpo",
    "jjojo",
    "lbosj",
    "utvub",
    "lpcvj",
    "kpvlj",
    "kpipv",
    "bjtip",
    "ljvnj",
    "bnbep",
    "nzblv",
    "kjtvv",
    "vpllb",
    "xbhpo",
    "njofo",
    "ebjsj",
    "tpipo",
    "nvtbj",
    "bnbtv",
    "lfokb",
    "ijhfo",
    "cpvhp",
    "lfjcj",
    "njlfo",
    "blvnv",
    "tijuf",
    "kjuub",
    "ijefo",
    "{btiv",
    "ptivv",
    "bsvhb",
    "sfjsb",
    "hjbsb",
    "nvlfj",
    "lpsjo",
    "lplpb",
    "ljsbj",
    "tbjfj",
    "ipsvj",
    "cpllb",
    "lpvjo",
    "kjtij",
    "sbllv",
    "kjubj",
    "psplb",
    "zbozb",
    "tbjhj",
    "nvnfj",
    "diplb",
    "lpubj",
    "blbof",
    "josbo",
    "nvflj",
    "bhblv",
    "npupo",
    "pzblv",
    "ufbup",
    "vljlj",
    "uftip",
    "fjcjo",
    "dipvv",
    "qjnbo",
    "pxbsv",
    "upufj",
    "hpvnp",
    "szpvj",
    "kjkvv",
    "ebjcv",
    "spvtp",
    "cvosj",
    "ubozb",
    "gvjlj",
    "j{vsf",
    "npifb",
    "npvtv",
    "hjonj",
    "epllv",
    "kjepv",
    "{vlfj",
    "publv",
    "hvjup",
    "updij",
    "npoij",
    "lpvsb",
    "kboqv",
    "jovlp",
    "ljnpo",
    "cptfj",
    "lbobo",
    "njipo",
    "cjgvv",
    "lbohp",
    "jlblv",
    "{vjnj",
    "jttfo",
    "ubotv",
    "hbubj",
    "ebflj",
    "cpdij",
    "cbjjo",
    "uplvj",
    "vnbkj",
    "lbojo",
    "dipsv",
    "lptfo",
    "plpsj",
    "ljipv",
    "blbsj",
    "ubohp",
    "ibosv",
    "kjlfj",
    "nftij",
    "lbohb",
    "tbjep",
    "bpbtb",
    "nfokp",
    "uftij",
    "cfosj",
    "xbuup",
    "lvspo",
    "eftij",
    "ibonj",
    "gvhvo",
    "jzboj",
    "lbjfo",
    "ifoib",
    "nftfj",
    "pibib",
    "jzplv",
    "lbtiv",
    "gvllv",
    "jtblp",
    "pijnb",
    "{vibo",
    "njvlf",
    "{fotf",
    "pnbsv",
    "sjebo",
    "gvubo",
    "vsbnv",
    "lpvcb",
    "objtv",
    "obhbj",
    "spufo",
    "npibo",
    "jubsj",
    "kjnfo",
    "kjeep",
    "lpoqp",
    "ijtij",
    "xbjup",
    "pkjlf",
    "joblb",
    "tfjsb",
    "vjoep",
    "vsjuf",
    "kboqb",
    "hvkvo",
    "lzbqb",
    "diplv",
    "cvolb",
    "zbspv",
    "kplzp",
    "iphbo",
    "psvnv",
    "hbufo",
    "lbosv",
    "hpuub",
    "lbsbf",
    "fgvef",
    "pvebj",
    "cfjcj",
    "bnfcb",
    "hputv",
    "ibblv",
    "gvspv",
    "efoqb",
    "zbtib",
    "sfjkj",
    "uptip",
    "tvnbj",
    "zpvbv",
    "gvfsv",
    "ojbhf",
    "ipepv",
    "iboqb",
    "gvbkj",
    "jqqjo",
    "sjkpo",
    "zvvjo",
    "jlbef",
    "kvvhv",
    "lfllb",
    "tijfo",
    "lbjib",
    "ufoqv",
    "bsfcj",
    "lpubf",
    "jtflj",
    "lfjij",
    "{pvfo",
    "hzb{b",
    "jepnv",
    "fnpup",
    "tvfkj",
    "nvdip",
    "lpvnf",
    "npolp",
    "ejsbo",
    "nbepj",
    "opqqp",
    "lvspj",
    "tfebj",
    "juplp",
    "njdij",
    "cfllp",
    "cbufj",
    "bkjnj",
    "tbjup",
    "tfdij",
    "tpobj",
    "kpvcb",
    "bptij",
    "pupup",
    "jlpnj",
    "hbotb",
    "lvolb",
    "jjnbf",
    "tivvj",
    "pnptb",
    "nvtfj",
    "hbjkj",
    "npolv",
    "kjlbo",
    "tbutv",
    "tvqqb",
    "tpvlj",
    "upvhf",
    "lbocv",
    "upvub",
    "ofllj",
    "tbjnv",
    "sbosj",
    "lbjtv",
    "uplvv",
    "tiblf",
    "pzbep",
    "nfjoj",
    "juufj",
    "wfspb",
    "tbkjo",
    "gjuup",
    "ifjpo",
    "tbjsj",
    "bupqj",
    "tbhpv",
    "spufj",
    "ebjbo",
    "jovkv",
    "pcbbo",
    "qbokj",
    "tfjkj",
    "pibjp",
    "cptvv",
    "qvsfj",
    "tflfo",
    "kjqqv",
    "ifooj",
    "jspbj",
    "tvuup",
    "hpcpv",
    "lpohp",
    "sfjhj",
    "iptij",
    "hjobv",
    "lpufj",
    "ljozv",
    "hvolb",
    "lfjzv",
    "ufipo",
    "zplfo",
    "jfnfo",
    "tpvlp",
    "tpdij",
    "plbhp",
    "jllbj",
    "dijgv",
    "nfnfj",
    "ebifo",
    "joojo",
    "nvofo",
    "ebjlv",
    "kjoeb",
    "{ftfj",
    "gvebo",
    "lfhfo",
    "lpjov",
    "lpvtb",
    "tvspv",
    "wboqv",
    "lbufj",
    "cptij",
    "fsjlp",
    "fsbnv",
    "sfjsj",
    "iptiv",
    "{fohj",
    "ebolp",
    "ijifj",
    "kjlvv",
    "sfo{v",
    "ljnbj",
    "upoef",
    "nfj{v",
    "tbtpo",
    "gvlbj",
    "sbjeb",
    "bjofo",
    "tbtbf",
    "pufuf",
    "epgjo",
    "ibolj",
    "njllj",
    "botij",
    "gvljo",
    "blvkj",
    "ufbsb",
    "nfohp",
    "lbjup",
    "qpqqv",
    "lvsbo",
    "uboub",
    "epkjf",
    "tfjjo",
    "nftpv",
    "pupnf",
    "phpsj",
    "tbllp",
    "ebzbo",
    "bxbtv",
    "zplpv",
    "nbojb",
    "bjtij",
    "lboxb",
    "ptbkj",
    "obohj",
    "fotpv",
    "jcbsb",
    "fljsj",
    "lzblv",
    "{pllb",
    "lpibo",
    "cjdij",
    "flpkj",
    "ebjjo",
    "bhvsb",
    "cjubj",
    "ljtfj",
    "ljopo",
    "nvgvv",
    "ljtbj",
    "nv{vj",
    "obttp",
    "zpvzb",
    "cpjsb",
    "lpjsv",
    "ibjlv",
    "lfjsb",
    "lbonv",
    "f{bsb",
    "hptvj",
    "fjlpv",
    "kbjcv",
    "ebouf",
    "plpkp",
    "joopv",
    "nfjhb",
    "folbj",
    "opvlb",
    "qjqjo",
    "tfjlv",
    "sfeep",
    "cpubo",
    "btfsv",
    "bjnpo",
    "ibtfj",
    "tivbv",
    "lpepo",
    "ibnbo",
    "qvejo",
    "cpvzb",
    "ijlfj",
    "qbqvb",
    "gvnfj",
    "dijzb",
    "bohzb",
    "hvocj",
    "{bcpo",
    "zbolv",
    "pqbtv",
    "nfocb",
    "hpofo",
    "foqfj",
    "blbnj",
    "fjkjp",
    "jqvsv",
    "juubo",
    "ljubf",
    "qbttb",
    "zvvtv",
    "jubtv",
    "tvzpv",
    "hfocb",
    "tvqbj",
    "cbllv",
    "lbsvj",
    "nbjnb",
    "ljupv",
    "ifjnf",
    "tplvj",
    "kpvnv",
    "ufttv",
    "bsbsf",
    "ipubj",
    "nvtvv",
    "spvhf",
    "efocb",
    "bxbsf",
    "polpv",
    "tboqp",
    "nfjhj",
    "cvutv",
    "lbtip",
    "{pvfj",
    "fcjtv",
    "epebj",
    "lfjfj",
    "gv{bj",
    "hfosj",
    "epspb",
    "hjtip",
    "hj{fo",
    "{pocb",
    "lfolb",
    "btftv",
    "xblzp",
    "lfonf",
    "nbdij",
    "bzvnj",
    "jnfkj",
    "cbkkj",
    "gvutv",
    "zvobj",
    "sbohv",
    "ufibj",
    "pnpnj",
    "ipvup",
    "cjtbj",
    "lplfj",
    "hzpgv",
    "npvkb",
    "lbnpo",
    "bcpup",
    "ptibo",
    "ijubj",
    "ifoup",
    "zpvcb",
    "eboob",
    "lfotv",
    "nbllj",
    "kpkjb",
    "eptpv",
    "lbobj",
    "hfocp",
    "tvubo",
    "bjnbj",
    "lfosf",
    "tbipv",
    "kjcbo",
    "ufolb",
    "qpoep",
    "objpv",
    "ijflj",
    "fupsv",
    "cvtiv",
    "hplvv",
    "poboj",
    "jdipv",
    "bnjop",
    "ojtfj",
    "ljzpj",
    "ibjhp",
    "ibjkp",
    "lfsvo",
    "vuubf",
    "bjlzv",
    "psjlp",
    "jubnf",
    "tfjup",
    "kpvij",
    "ibjkj",
    "nvljo",
    "fufsv",
    "dibib",
    "pvlpv",
    "psjlj",
    "blvsb",
    "gvvjo",
    "zpuub",
    "plvhj",
    "lbuup",
    "joifj",
    "spllv",
    "lfocj",
    "psblv",
    "hptij",
    "jqqbj",
    "lponb",
    "ibubo",
    "nbhhv",
    "pcpsp",
    "ejohp",
    "qfuup",
    "bepcj",
    "ubcjo",
    "bebob",
    "tijwv",
    "hjlpv",
    "tijfb",
    "nfozv",
    "hjspo",
    "qbjsv",
    "tpuup",
    "vsplp",
    "voepv",
    "ibooj",
    "blvnf",
    "svnfo",
    "kjlzp",
    "tivkj",
    "cpohp",
    "opj{v",
    "jcvlj",
    "focvo",
    "pobcf",
    "zvvhb",
    "vlbup",
    "ubcpv",
    "tp{pv",
    "qplbo",
    "ibtib",
    "npvlf",
    "ozv{v",
    "cpvkv",
    "cpvgv",
    "sjtfj",
    "pvsfo",
    "lbopo",
    "nbipv",
    "tpspv",
    "nvsvo",
    "tipoj",
    "iboup",
    "bcblb",
    "pljsv",
    "tpllj",
    "ebvej",
    "hvubj",
    "hbllv",
    "ljebj",
    "spoep",
    "hf{bj",
    "hvsfo",
    "qbufj",
    "nflfo",
    "lbjsp",
    "qpfkj",
    "zbcpv",
    "lfjhv",
    "tpvcj",
    "jobsj",
    "nbolj",
    "iblpo",
    "tbcpj",
    "lb{bj",
    "polbj",
    "pcblf",
    "{bqqv",
    "tfebo",
    "zpvpo",
    "pxbcj",
    "tvebo",
    "njopv",
    "lpjsf",
    "kpvgv",
    "ojfsv",
    "lptvj",
    "tfpsj",
    "bsjsv",
    "xbkvo",
    "kpvip",
    "obohp",
    "gbjcb",
    "svutv",
    "uplpv",
    "ip{po",
    "lpefo",
    "qboeb",
    "fjvub",
    "ijfsv",
    "bcjub",
    "efnpo",
    "tijxb",
    "cfjtv",
    "jo{fj",
    "ljonf",
    "tibqv",
    "tpnfj",
    "efjhp",
    "tibsj",
    "ljoij",
    "zbtiv",
    "tbnvj",
    "ibpsv",
    "njoxb",
    "pbtij",
    "epvef",
    "ljlvj",
    "gvnbo",
    "puphb",
    "svj{v",
    "tibsf",
    "nbzpj",
    "ifjzb",
    "nvhpj",
    "ibfnf",
    "tibep",
    "vlfuf",
    "ljtfo",
    "boofj",
    "kvosb",
    "sbjgv",
    "efcbo",
    "nvefo",
    "jpojb",
    "pokpv",
    "sbvtv",
    "tvtij",
    "nb{vj",
    "btbsj",
    "tpohv",
    "cbogv",
    "lbnzv",
    "lvepv",
    "qzvkj",
    "ufohv",
    "joflb",
    "iplbo",
    "ifnjo",
    "ljonb",
    "lvgvv",
    "sjtij",
    "votij",
    "ijtip",
    "jocff",
    "spvsj",
    "ljdif",
    "ifotb",
    "gvvgv",
    "tijpo",
    "pkjlj",
    "hjojb",
    "ubopv",
    "obocv",
    "objsb",
    "plbnj",
    "tphbj",
    "vsfsv",
    "ofebo",
    "nfjsp",
    "lbcvo",
    "jhvtb",
    "zpvsv",
    "pizpv",
    "pvsbj",
    "kvtij",
    "lbjbo",
    "zvjnf",
    "nfonj",
    "{vuup",
    "xbsbv",
    "{vtij",
    "lfjcv",
    "ufjfo",
    "gvzpv",
    "ufohb",
    "nfoqv",
    "eblbj",
    "gvsfb",
    "tbozp",
    "ojllj",
    "ebtib",
    "opupv",
    "lvvcp",
    "lpvhj",
    "sjofo",
    "tfjbv",
    "nfjlb",
    "sfczv",
    "jlpup",
    "hvocb",
    "tpvhj",
    "zpuuf",
    "tfjsj",
    "vsjof",
    "lvvzv",
    "oblbj",
    "sbjtf",
    "hjufj",
    "cjpsb",
    "fjljo",
    "nbhbj",
    "tivhp",
    "cpohv",
    "ibjtv",
    "ibj{f",
    "hbsfo",
    "pibsb",
    "svqjb",
    "ibsbv",
    "poupv",
    "jofeb",
    "zpvtv",
    "kpvlp",
    "tfoij",
    "ublzp",
    "vtvcb",
    "ojupv",
    "hbvej",
    "kjtpo",
    "cjlbp",
    "ljsbv",
    "lbonj",
    "bpjlb",
    "lbtij",
    "lpvsj",
    "hvvxb",
    "gvojo",
    "kpvkv",
    "obptv",
    "vnbnf",
    "sfkjf",
    "nfllj",
    "tbocb",
    "ublpv",
    "cpifj",
    "lvcvo",
    "psvup",
    "jubnv",
    "lftij",
    "qbjqv",
    "lpllb",
    "gfbvf",
    "ifipv",
    "nbocp",
    "lbkjo",
    "pgjtb",
    "fotfj",
    "jopsv",
    "uponb",
    "zpolv",
    "ifeep",
    "pljob",
    "njoof",
    "cvolp",
    "lpspv",
    "ipllv",
    "lfocv",
    "cbtib",
    "ofoqj",
    "lpqqv",
    "ljobo",
    "nvuup",
    "pubxb",
    "lbcbv",
    "ibzbv",
    "lbgvo",
    "jspoj",
    "lvsfj",
    "tp{fj",
    "upvtb",
    "plbtv",
    "upvzb",
    "zpvlp",
    "kpvtp",
    "nfhfo",
    "obocb",
    "qpfnv",
    "lfjsf",
    "peflp",
    "efjsj",
    "tpflj",
    "efolb",
    "hvgvv",
    "tplpv",
    "zvvsj",
    "lvnfo",
    "tpvhp",
    "ebjtb",
    "kvtiv",
    "ubf{v",
    "upefo",
    "juubj",
    "jolzp",
    "ljofo",
    "bebnv",
    "tptvv",
    "tboep",
    "vkveb",
    "epsvj",
    "ufjhj",
    "tipvj",
    "btv{v",
    "ljfub",
    "vljnf",
    "ebj{v",
    "zpxbj",
    "lpvlb",
    "hfogv",
    "ebjnv",
    "ijjsp",
    "vsjlb",
    "lpv{v",
    "kjotb",
    "ebjnb",
    "fotij",
    "ljebo",
    "kvosp",
    "cjzpj",
    "ubtvv",
    "lbcfo",
    "cbsjp",
    "qjqqv",
    "ubocp",
    "svjjo",
    "cjlpv",
    "uptib",
    "tbupj",
    "jotbo",
    "cfupo",
    "lj{pv",
    "lvkvv",
    "jzblv",
    "putvf",
    "tfosb",
    "bpjnf",
    "ufufj",
    "obsbv",
    "gvufj",
    "nfubo",
    "objup",
    "spcjj",
    "ipvhf",
    "pocbo",
    "ijkpv",
    "ubjnj",
    "qpsjp",
    "plljj",
    "nvlpo",
    "ojokb",
    "ubtij",
    "lfohp",
    "ufjup",
    "lptbo",
    "lfolj",
    "puflj",
    "sfokj",
    "efoqp",
    "tbohp",
    "iptbj",
    "bodij",
    "psv{p",
    "gvtbo",
    "difeb",
    "jospv",
    "lvsvj",
    "ibvtv",
    "jobtb",
    "lzpub",
    "tibtv",
    "joofo",
    "cboep",
    "sjolj",
    "spvsv",
    "epkjo",
    "tibhj",
    "ibohb",
    "sbggb",
    "buppj",
    "hpvhp",
    "tfoup",
    "jobnv",
    "pvfsv",
    "zpspj",
    "tpobf",
    "ubhfo",
    "zvvhj",
    "tfocv",
    "tvjtv",
    "zvcbb",
    "hbjfo",
    "hbqqj",
    "hbupv",
    "utvnb",
    "tbonj",
    "spbsv",
    "kpvsp",
    "dibkj",
    "kvvnf",
    "gvlbo",
    "ipkvv",
    "dijfo",
    "lpbsb",
    "ofjtv",
    "pebuf",
    "kjqqb",
    "tbovb",
    "epvhb",
    "tvjsj",
    "lbtfo",
    "ljcfo",
    "tputv",
    "ibtpv",
    "gvdij",
    "hpvjo",
    "lfpcj",
    "ofolj",
    "jsflf",
    "cbspb",
    "lfotb",
    "lfocb",
    "cjfsb",
    "lfjhb",
    "hfijo",
    "tbjfo",
    "iblpv",
    "peflj",
    "cjzpo",
    "ijtbj",
    "tbtpv",
    "bocvo",
    "ipocb",
    "kbocb",
    "ebotv",
    "nboqp",
    "kjkpv",
    "lbtbo",
    "cbotv",
    "nbqqv",
    "ljhvv",
    "vnfsv",
    "bsfcb",
    "lp{vf",
    "ebolv",
    "zbibj",
    "plbqj",
    "npspj",
    "judij",
    "tfoob",
    "lblbo",
    "ubjlp",
    "bsvlv",
    "uplfo",
    "jkjnv",
    "bljsv",
    "lfjnv",
    "jljsv",
    "zbpsb",
    "plbcv",
    "jnjob",
    "ebsvj",
    "kpllj",
    "jotvv",
    "fsbcv",
    "lpvkv",
    "cvobo",
    "jupnf",
    "jsplf",
    "nfjcj",
    "vtvef",
    "psvub",
    "sjogv",
    "dijhv",
    "ofbhf",
    "cfolj",
    "tpvhv",
    "tipkp",
    "{pocj",
    "nbzvv",
    "objwv",
    "sjqqj",
    "joflp",
    "lblzp",
    "jublp",
    "tpvlv",
    "ibjgj",
    "nvlvj",
    "vfjup",
    "ipvkj",
    "opccv",
    "pokjo",
    "tvlbj",
    "spebo",
    "wpubo",
    "sbjij",
    "jovkj",
    "lblbv",
    "tfuup",
    "tfjjf",
    "lbotp",
    "blvnj",
    "lvjbj",
    "upsfj",
    "njzpv",
    "obokj",
    "hjtbo",
    "izvnp",
    "ijcpo",
    "nplfj",
    "ofokj",
    "ipbtv",
    "pvubj",
    "lpvzv",
    "tfotb",
    "kpebj",
    "njoup",
    "p{vlf",
    "kjifo",
    "kvvlv",
    "jcpnf",
    "kjtfj",
    "cbjzv",
    "jttip",
    "bogfb",
    "ijsjo",
    "{pvtb",
    "zvebo",
    "lpvcv",
    "tfolp",
    "psvgv",
    "hptip",
    "lfj{v",
    "ibllv",
    "ipvfj",
    "hphbo",
    "gbsbp",
    "obtij",
    "ufnvv",
    "cpvhf",
    "jlf{v",
    "ljocv",
    "epcbj",
    "jnboj",
    "cbtip",
    "obnbf",
    "ptbsb",
    "zbnbo",
    "kjcjf",
    "polfo",
    "hvspj",
    "{vsvj",
    "cjufo",
    "tpvpv",
    "hfobo",
    "ibtvv",
    "lvcpv",
    "lpvlf",
    "{fnbo",
    "ejpsv",
    "fo{vj",
    "potib",
    "tvutv",
    "{bjzp",
    "hjhfj",
    "sjolb",
    "zbqqj",
    "fsvhb",
    "ipolj",
    "zbtbj",
    "hpvnf",
    "zpkpv",
    "vnjif",
    "hfokj",
    "nvkvo",
    "josfj",
    "gvtbj",
    "fljjf",
    "tibhv",
    "phzpv",
    "johjo",
    "ublbo",
    "zpohv",
    "obuup",
    "ibepv",
    "lbfef",
    "objlj",
    "cbnfo",
    "njcvo",
    "sjfkv",
    "kvolb",
    "ipzpv",
    "ofdib",
    "jutvv",
    "fljnv",
    "lpftv",
    "ozvtv",
    "zpvsj",
    "hbolb",
    "gvtfo",
    "iblvv",
    "cpcjo",
    "hbspb",
    "fsjup",
    "lpbkj",
    "psjcv",
    "fohbo",
    "ubokj",
    "upcjo",
    "zpvlv",
    "lpvbo",
    "nfejb",
    "upvlj",
    "njufj",
    "pibob",
    "cpebj",
    "uplvo",
    "phbnv",
    "ofoof",
    "zblfj",
    "ejnpo",
    "tivnf",
    "blbhf",
    "jhzpv",
    "tpvip",
    "bjtpv",
    "dijqv",
    "bllbo",
    "tvnjb",
    "tibqp",
    "hbolv",
    "qpoqv",
    "jxbtf",
    "vlbsv",
    "ijufj",
    "ubipv",
    "eboxb",
    "ebjxb",
    "b{vlj",
    "tbjlp",
    "tbplb",
    "jpoob",
    "lpiip",
    "qbtij",
    "bnbnj",
    "ljljo",
    "bsjkv",
    "ptflj",
    "gbohv",
    "cvepv",
    "ufzvv",
    "ibllj",
    "kvvzv",
    "hjboj",
    "blvcj",
    "joipo",
    "pcjsv",
    "lvdij",
    "dijnf",
    "tponv",
    "bzbnf",
    "lpdij",
    "lbnfp",
    "ufjep",
    "jlvfj",
    "lbjtp",
    "upspj",
    "kvlfo",
    "hvsjp",
    "sfjcv",
    "fnpkj",
    "ipvbo",
    "spvfj",
    "blpep",
    "hpvcv",
    "cbupv",
    "plpsv",
    "ljosj",
    "nbkjo",
    "voqbo",
    "cbejo",
    "diptb",
    "ipggb",
    "ptpsf",
    "utvlb",
    "bjobj",
    "bolfo",
    "ipv{b",
    "jobhp",
    "jdivv",
    "lvj{f",
    "tijeb",
    "tiblp",
    "nbibo",
    "tvupo",
    "vjolv",
    "zpdij",
    "jjlbf",
    "njkpv",
    "tbplv",
    "ibtbo",
    "hzblv",
    "fj{fo",
    "lb{pv",
    "tijbo",
    "gvvhb",
    "cvjbj",
    "fblpo",
    "sbjnv",
    "zplfj",
    "hfohp",
    "opvep",
    "jxbzb",
    "cbjpo",
    "lbosp",
    "vqqvo",
    "tvnpv",
    "pkjsv",
    "tblfo",
    "jllfo",
    "pfutv",
    "cpsvo",
    "fophv",
    "ubjeb",
    "bovtv",
    "hjufo",
    "sjejb",
    "cvtpv",
    "lpvnv",
    "obolj",
    "tibcv",
    "kpvcv",
    "ljoxb",
    "plfzb",
    "ifosj",
    "sbonp",
    "pgjtv",
    "upsjp",
    "gboep",
    "kvvsj",
    "lfupv",
    "psfbv",
    "spvlb",
    "pljcb",
    "{vlbj",
    "jsf{b",
    "obfsv",
    "ubebj",
    "blfep",
    "gvkvo",
    "ebjlp",
    "zvvcf",
    "lbfsv",
    "ljcvo",
    "qjbop",
    "cpvlp",
    "ljutv",
    "tijnb",
    "hvtbj",
    "nfbuf",
    "vlfsv",
    "tivhj",
    "hjkjo",
    "sfjcj",
    "jxbob",
    "cjuup",
    "nfjlj",
    "xbipv",
    "ljgvv",
    "sjoep",
    "sbjvo",
    "lbtvv",
    "lpvsv",
    "nfebo",
    "ljllv",
    "gvoep",
    "pubnv",
    "hvojo",
    "upfoj",
    "lbonb",
    "gvupj",
    "cjqqv",
    "kblfo",
    "vhplv",
    "cjeep",
    "pepsj",
    "tvqjb",
    "cv{bj",
    "ljjoj",
    "ipoop",
    "lpvtv",
    "ijqqj",
    "nvuub",
    "sboup",
    "jtphj",
    "cfohp",
    "zvvij",
    "lpoqb",
    "ijjlj",
    "ufoip",
    "epvlf",
    "lvufo",
    "gvsvj",
    "gvkjo",
    "kjonp",
    "blbsv",
    "fepvj",
    "hbtij",
    "ubpsv",
    "kjufj",
    "cbufo",
    "gfotv",
    "ofibo",
    "sjotv",
    "ijsvj",
    "svtij",
    "lbjuf",
    "tpveb",
    "vo{bo",
    "utvlv",
    "ubebv",
    "lfjzp",
    "jbogv",
    "gvvtb",
    "lpvep",
    "hfozv",
    "bjcjo",
    "tbtpf",
    "lbptv",
    "sjosj",
    "lbipv",
    "jcvtv",
    "fnpop",
    "jspsj",
    "lj{bj",
    "ibnvv",
    "lboqb",
    "npzpv",
    "vdivv",
    "lbifo",
    "jozpv",
    "flvcp",
    "ovsjf",
    "jtivv",
    "zvvlv",
    "nboob",
    "pufsb",
    "tbjhp",
    "lfjsp",
    "oflfj",
    "kjtbo",
    "lvpub",
    "joejp",
    "upv{b",
    "phzbb",
    "bsbcb",
    "folpo",
    "jotiv",
    "hfotp",
    "ftvqp",
    "lplfo",
    "gvsfj",
    "gpspv",
    "bzvnv",
    "nflbp",
    "hvhfo",
    "lbtbj",
    "tivup",
    "fudij",
    "pvupv",
    "febnv",
    "lbzpj",
    "kjpsv",
    "ifutv",
    "ebqqj",
    "blvhj",
    "fsjzb",
    "lpvtp",
    "nbebo",
    "njlpv",
    "bo{fo",
    "ipvtv",
    "kjb{p",
    "eponb",
    "btbtf",
    "epnjo",
    "nptib",
    "plvcj",
    "lbjkj",
    "diblj",
    "nbttf",
    "lpnpo",
    "cpvsb",
    "nvipo",
    "lbj{v",
    "zbllf",
    "hplbj",
    "tijtb",
    "lfjep",
    "ebjfo",
    "objgv",
    "nvhpo",
    "jbgpo",
    "cvsfb",
    "jhblv",
    "njtfj",
    "kvvlb",
    "ubhhv",
    "sbjtb",
    "ufeep",
    "jozvv",
    "{bolj",
    "lblfj",
    "diplp",
    "bnjcb",
    "sfolp",
    "cblfj",
    "jocvo",
    "ljlpo",
    "{focj",
    "njnpo",
    "zpjlj",
    "flblj",
    "tivlv",
    "lbokj",
    "ofjsp",
    "ofjcj",
    "hbojo",
    "ojtff",
    "ojebj",
    "ijebj",
    "spvkp",
    "jllpv",
    "sboqv",
    "epjsj",
    "lpvfj",
    "utvjf",
    "szvkv",
    "sptfo",
    "tvjlj",
    "qflbo",
    "ofcpv",
    "uboup",
    "pjxbj",
    "spvcb",
    "ebcfo",
    "ljlbo",
    "njebj",
    "tijsp",
    "upvzv",
    "epvtf",
    "zpnfp",
    "ubjpo",
    "qjsfb",
    "gpupo",
    "cptvo",
    "kvtfj",
    "lpvfo",
    "tpvhb",
    "bjhbo",
    "ubj{b",
    "nfllb",
    "hbkpv",
    "tfooj",
    "cvllv",
    "jodij",
    "bcvkb",
    "lvonv",
    "hpvtb",
    "lbopv",
    "tfjhj",
    "nvupo",
    "ijnfj",
    "lbnbv",
    "ptpsv",
    "ufozv",
    "hbnbo",
    "sbqqb",
    "ebvnb",
    "ibolf",
    "offzb",
    "lfjhp",
    "gbjup",
    "bsvcj",
    "vsbnb",
    "qjbgv",
    "lpllj",
    "bobpv",
    "hjopv",
    "cvtij",
    "gvcfo",
    "kjfjo",
    "ebufj",
    "tfjlb",
    "vsbuf",
    "pljuf",
    "tibup",
    "lfsbj",
    "hbokj",
    "ipupo",
    "bttbj",
    "sbocv",
    "nbotv",
    "bolpv",
    "tbtbv",
    "izv{v",
    "tibcb",
    "czvup",
    "ipoep",
    "tbgjo",
    "btbhj",
    "dijcj",
    "sbptv",
    "wbkjo",
    "bnbsj",
    "lbutv",
    "tbupv",
    "lfolp",
    "jljtb",
    "tijkj",
    "kbqqv",
    "npveb",
    "ljkvv",
    "plvsj",
    "hveep",
    "lplbo",
    "ufutv",
    "upsfo",
    "pqfsv",
    "tptfj",
    "nbjzp",
    "qfjef",
    "sfolb",
    "bsjob",
    "fjifj",
    "zptij",
    "tvnbv",
    "kjokb",
    "zbolj",
    "ubfnb",
    "cbsjo",
    "sfoup",
    "qpqqp",
    "ojtvj",
    "fsvgv",
    "ojtij",
    "pvebo",
    "ijepj",
    "hjifo",
    "fjofo",
    "jtbnf",
    "kjkjo",
    "jsboj",
    "cbtfo",
    "plvtv",
    "bufep",
    "ipvnv",
    "ubjzp",
    "kjbkj",
    "lpszp",
    "cvnpo",
    "bjtbo",
    "zvfzv",
    "jebtv",
    "boubj",
    "polfj",
    "ibsbj",
    "ebhpo",
    "bljcb",
    "vnjfo",
    "svjkj",
    "ofhbv",
    "svjhp",
    "upvsv",
    "lpcbj",
    "cbsjb",
    "kpvlb",
    "cvozp",
    "hjtfj",
    "tbjlb",
    "lpvkp",
    "eptvv",
    "npsjo",
    "dijsj",
    "vfccv",
    "obobf",
    "peplv",
    "pojcj",
    "ufjtv",
    "tbnfo",
    "ofllp",
    "vfuup",
    "vsbip",
    "opvgv",
    "ibxbj",
    "lboqv",
    "zbllj",
    "tfcjo",
    "ljplv",
    "qzvnb",
    "uftpv",
    "cplfj",
    "boqpv",
    "bufnp",
    "izblv",
    "zvvlj",
    "qfllv",
    "np{{v",
    "fodij",
    "nfuub",
    "blbtv",
    "diblb",
    "tfqjb",
    "fjtib",
    "ebjlb",
    "tbjbv",
    "tbsjo",
    "ipifj",
    "upuup",
    "tf{po",
    "ufjhp",
    "gv{fj",
    "objcv",
    "ipvlb",
    "ljhbf",
    "npbsf",
    "tibnp",
    "lpgvv",
    "ephhv",
    "spfcf",
    "lbllp",
    "vsvhb",
    "spvzb",
    "hjofo",
    "lpvib",
    "qjllv",
    "bhflv",
    "tijov",
    "ifolp",
    "lbfsj",
    "lbsfo",
    "tiplv",
    "{focv",
    "vsbnj",
    "zvvoj",
    "bspnb",
    "lbnfo",
    "lbotb",
    "zpnfj",
    "gpoup",
    "qbogv",
    "tfosp",
    "bjupv",
    "uflpv",
    "ubjnv",
    "cpoep",
    "lpvcj",
    "jnpkp",
    "obsbj",
    "cbuup",
    "{butv",
    "bojnf",
    "lvspv",
    "sbkjp",
    "npvgv",
    "kvlbo",
    "bsfgv",
    "jxblv",
    "nbzpv",
    "tboef",
    "pnfhb",
    "fsvhv",
    "hptfo",
    "obffj",
    "ebjkj",
    "poblb",
    "kvvzb",
    "ublbj",
    "fttfj",
    "nfnjf",
    "divsv",
    "jlbsv",
    "lptpv",
    "qfoof",
    "nbllb",
    "sjojb",
    "tvokj",
    "nfjtv",
    "lpvlp",
    "bsbnv",
    "hpobo",
    "dijzp",
    "sjkvo",
    "nbspv",
    "tptij",
    "tivij",
    "zbtfj",
    "johpv",
    "ipttb",
    "obpsj",
    "iplfo",
    "ipsjf",
    "xbjlb",
    "spepo",
    "bhfsv",
    "dijlv",
    "hpeep",
    "ijptv",
    "cfspb",
    "jsjnf",
    "njtbp",
    "fjtfo",
    "ebokp",
    "lfuup",
    "gfjtv",
    "xbsbj",
    "potfj",
    "ejohj",
    "tfocj",
    "bufsv",
    "nfjvo",
    "pnjzb",
    "lbjcb",
    "izvnb",
    "kplfj",
    "jupjo",
    "pljif",
    "lvlvj",
    "utvzb",
    "sjnbo",
    "bsbub",
    "puplp",
    "nfjzp",
    "jovlb",
    "lzvcb",
    "zpvep",
    "lbjkp",
    "ebjpv",
    "upeep",
    "ljefo",
    "jlpsv",
    "ubuub",
    "gvvib",
    "sjolv",
    "tfonv",
    "kblfj",
    "hpipv",
    "ifolb",
    "ifjjo",
    "lfoup",
    "up{bo",
    "tijzb",
    "ppbnj",
    "ibokj",
    "jubcb",
    "cvsfj",
    "jotij",
    "spvlv",
    "{bohf",
    "upvtv",
    "sboqf",
    "tflpj",
    "ipocv",
    "sboqj",
    "ubofo",
    "dibnv",
    "upvgv",
    "tfjpo",
    "ufubo",
    "ifokb",
    "divcv",
    "sfutv",
    "bsbtv",
    "sjqqb",
    "gjsfp",
    "tivgv",
    "kjtiv",
    "zpvhp",
    "bobub",
    "ijlbf",
    "lpqqj",
    "lboob",
    "lfohj",
    "dijub",
    "nbepv",
    "tfsjo",
    "lfoqv",
    "utvob",
    "fsvnv",
    "hjebj",
    "fo{bo",
    "blbfj",
    "hjgvo",
    "lzpsj",
    "ofoep",
    "tpvnv",
    "hvolj",
    "ifosp",
    "bpbkj",
    "opvib",
    "tbotv",
    "epvhv",
    "{fokj",
    "nvopv",
    "ljibo",
    "sfjsv",
    "gvsbj",
    "nbnpv",
    "cfeep",
    "gvopv",
    "ipllf",
    "tijcb",
    "fbvfj",
    "ojhpo",
    "eblvv",
    "xbllb",
    "bofsv",
    "ibzbj",
    "upvij",
    "xbjsv",
    "ebcpv",
    "ljhpv",
    "tivsb",
    "sfhbo",
    "lbhbj",
    "ebokj",
    "vudij",
    "ojgvo",
    "upvib",
    "sbnjb",
    "tpspj",
    "nfibj",
    "kvvlj",
    "upllp",
    "ljubo",
    "tfocp",
    "lzbgf",
    "njolv",
    "ufjsf",
    "njtpo",
    "ojtbj",
    "lbcjo",
    "ojlbj",
    "dijnj",
    "sbokb",
    "nfipv",
    "jsfsv",
    "sfo{b",
    "ubjij",
    "ljvsj",
    "tpvxb",
    "sbuup",
    "sjonp",
    "ipjlv",
    "lpvxb",
    "lpohb",
    "bxbcj",
    "blvvo",
    "tvlpb",
    "bojnb",
    "tbhfo",
    "bpcpv",
    "xbjsp",
    "hpojo",
    "gvsvf",
    "np{pv",
    "hvtib",
    "upsbj",
    "tijsj",
    "jxbcb",
    "ppbkj",
    "czvsp",
    "sfojo",
    "opvfo",
    "upvlb",
    "ijtiv",
    "efjnv",
    "jcvsv",
    "qvsbp",
    "npqqv",
    "joibo",
    "volpv",
    "zvfsv",
    "kpvuf",
    "bqvsj",
    "ofo{b",
    "ipvqv",
    "ljipo",
    "kjlfo",
    "tipfo",
    "tijub",
    "zpv{v",
    "gvnpv",
    "tvfep",
    "btpcj",
    "lpfzp",
    "hjsfj",
    "pnflp",
    "qputv",
    "gvupv",
    "tbjlj",
    "bhbsj",
    "efllj",
    "lfbob",
    "ofuup",
    "ubsjo",
    "jobtf",
    "fohfo",
    "obolb",
    "lphbj",
    "divsf",
    "lbsbo",
    "sjoqb",
    "jolfo",
    "ftvsv",
    "svcfo",
    "lbjlv",
    "sboeb",
    "ipvsv",
    "ijzpv",
    "epvcv",
    "ibjfj",
    "ojoqv",
    "lpocj",
    "hpzpv",
    "tpspf",
    "kplbj",
    "kvobo",
    "lfjuf",
    "bupef",
    "blbhp",
    "iblbo",
    "lbjgv",
    "{fhfo",
    "jtblb",
    "vupnv",
    "gvocp",
    "ipvuf",
    "ifoqj",
    "lbgvf",
    "fotib",
    "ibtiv",
    "cj{bj",
    "{vhbj",
    "ufjsv",
    "zpvlj",
    "hpufo",
    "hblpv",
    "jtfzb",
    "ibnfo",
    "utvcv",
    "botfj",
    "ojolv",
    "cbuub",
    "tivkv",
    "cfsvo",
    "ebjov",
    "bubsv",
    "tfjkp",
    "npvsj",
    "tbtbj",
    "hpvhj",
    "tijoj",
    "epspo",
    "nvlbf",
    "ijspv",
    "jqqpv",
    "iboqv",
    "juupv",
    "lpuub",
    "fjubj",
    "tphvv",
    "epkpv",
    "tbolv",
    "upvkj",
    "gvepv",
    "ufjcv",
    "tijtp",
    "lvtbv",
    "lblpj",
    "cbqqv",
    "plvoj",
    "qjkjo",
    "ufolj",
    "hbllb",
    "ipspv",
    "ijljo",
    "pqbsv",
    "kpvkj",
    "potfo",
    "fokpj",
    "ibjnv",
    "ifoob",
    "nbsfj",
    "tpvvo",
    "cfj{v",
    "ipvkp",
    "szpvf",
    "iponb",
    "lzpnv",
    "zbipv",
    "gfjlv",
    "kjllb",
    "hfebo",
    "cvubj",
    "ifjbo",
    "pjsbo",
    "hbebj",
    "lbolp",
    "njnbj",
    "ljopv",
    "spsjf",
    "ljzpv",
    "zbsbv",
    "nvjnj",
    "qbjpo",
    "hblbj",
    "qpotv",
    "cjtvj",
    "pofhb",
    "hvspv",
    "wjefp",
    "czpvf",
    "cvsbo",
    "lpnbj",
    "zpvhj",
    "bojtv",
    "vfupv",
    "njpnp",
    "cvupv",
    "zptfo",
    "njsfo",
    "lpvpo",
    "hjoqp",
    "tivcv",
    "gvsbo",
    "zvvep",
    "tfj{v",
    "tivsv",
    "pvifo",
    "psfjo",
    "pzptp",
    "ifokj",
    "tvbob",
    "bobhp",
    "ijlpv",
    "tfokb",
    "cjohp",
    "epvsj",
    "ifoqv",
    "cvcvo",
    "ipvcj",
    "cvubo",
    "zvlbj",
    "jdijj",
    "kpcbo",
    "ibjlj",
    "zvvfo",
    "foojo",
    "hjnpv",
    "svocb",
    "tbonb",
    "lzbej",
    "gvkpv",
    "qbsfo",
    "bolbj",
    "tvjlb",
    "nbohp",
    "hbjcv",
    "jubsv",
    "tpvpo",
    "lpocp",
    "tfjep",
    "gvcjo",
    "pspsb",
    "vnflv",
    "lpolj",
    "nbjlp",
    "utvlj",
    "cbsfj",
    "bttfo",
    "kpvfo",
    "qbutv",
    "sfllj",
    "nfouf",
    "xbhfo",
    "vonfj",
    "lfjnf",
    "tijzp",
    "lpvkj",
    "lzbsj",
    "nbocb",
    "jlbtv",
    "zpvkv",
    "upojo",
    "njnbv",
    "lzpvj",
    "tflzp",
    "spnjp",
    "ibttv",
    "uputv",
    "tfjop",
    "sjocv",
    "zbhbj",
    "xbifj",
    "ebllv",
    "ijkvo",
    "ubocj",
    "zpcvo",
    "lplzv",
    "nbupv",
    "ojolb",
    "zpvjf",
    "{bllv",
    "ovcjb",
    "cbhfo",
    "xbjep",
    "efoup",
    "qbolv",
    "lvvij",
    "ljlbj",
    "zpjnf",
    "pnbib",
    "hjohb",
    "lvllv",
    "gvlfj",
    "kbolj",
    "spoqb",
    "gvolb",
    "nbhbp",
    "zvvip",
    "ljtpv",
    "ipqqb",
    "lblbb",
    "sjkkj",
    "epsbo",
    "sbllb",
    "lbdij",
    "nbjsb",
    "njkjo",
    "tfjib",
    "lfjcb",
    "tiplb",
    "lpvuf",
    "voifo",
    "ubohj",
    "wjpsb",
    "sjozv",
    "fjzpv",
    "lbftv",
    "dipvj",
    "ptipv",
    "zbohv",
    "foufo",
    "ibvsb",
    "tbtiv",
    "spifo",
    "{pvip",
    "qbuup",
    "lb{vp",
    "jjjsf",
    "zvvzp",
    "lvpup",
    "utvkj",
    "gvuub",
    "cpllj",
    "hjolb",
    "bttfj",
    "nbjsv",
    "ppjtb",
    "kvvkj",
    "spnbo",
    "jfsfj",
    "bcjsv",
    "fejub",
    "ubjlv",
    "ib{vj",
    "qzvsf",
    "lbjvo",
    "ubptv",
    "nfspo",
    "lb{fj",
    "cpvnj",
    "npoup",
    "ojogv",
    "ubjhb",
    "lfjib",
    "tbspv",
    "ibtpo",
    "ubcfo",
    "fonfj",
    "cvzpv",
    "ubupv",
    "sfjcb",
    "gvohj",
    "lpvgv",
    "lbuuf",
    "zbebo",
    "zbepo",
    "efqqb",
    "lbokb",
    "jopgv",
    "kjo{v",
    "ebipv",
    "zptbo",
    "njfsv",
    "gvszp",
    "cbjcv",
    "ibqqj",
    "dijcb",
    "svjij",
    "lvnpo",
    "ipfsv",
    "kphfo",
    "ljufj",
    "kpvhp",
    "gpoeb",
    "lbozp",
    "tijlj",
    "cbkjo",
    "boibj",
    "kptij",
    "cjolb",
    "ufjlj",
    "bsvnj",
    "ojhvo",
    "ipsvo",
    "tijhp",
    "tivfj",
    "lbvsv",
    "zbzvv",
    "bijsv",
    "kjnbf",
    "ubfsv",
    "pqvob",
    "utvhv",
    "kjhhv",
    "lfjlp",
    "jllbo",
    "lbjqb",
    "vxbhj",
    "uppsj",
    "ljhbj",
    "lbefo",
    "psvep",
    "ipoqp",
    "tvf{v",
    "pnpnf",
    "bkbsv",
    "ibjub",
    "tbdij",
    "lptiv",
    "kpvhv",
    "ijepv",
    "lpoup",
    "gvsvv",
    "lfotp",
    "hbcbo",
    "ljubj",
    "zpvcj",
    "tvufj",
    "ofoqv",
    "bhfzb",
    "bjsfo",
    "cpvhv",
    "lpbnj",
    "lvtbj",
    "qjoub",
    "nvspo",
    "zvtpv",
    "ptfsp",
    "lblpv",
    "ubjpv",
    "zblbj",
    "lbnfj",
    "fofnj",
    "{buup",
    "tfjtb",
    "gvubj",
    "ubjxb",
    "kpspv",
    "kjtib",
    "npuup",
    "ufoqb",
    "vfjcv",
    "ubtbj",
    "nbtij",
    "lppsv",
    "nfupv",
    "tpgvp",
    "npebo",
    "lvopv",
    "fcbtv",
    "tvpup",
    "zphfo",
    "ibutv",
    "upvjo",
    "kvhfo",
    "kbblv",
    "hfonb",
    "iptpv",
    "cplpv",
    "kvvbj",
    "tfolv",
    "sjllj",
    "tijsv",
    "ljdij",
    "tpfsv",
    "tpebj",
    "lfjzb",
    "tpblv",
    "upvhj",
    "bjtfj",
    "nvzpv",
    "ubnbv",
    "bsvgb",
    "sjibo",
    "gvtiv",
    "sjdij",
    "cpefj",
    "psbsv",
    "psjsv",
    "lpzpv",
    "qjifo",
    "njutv",
    "hbotp",
    "lpsbj",
    "uflbj",
    "pcplp",
    "sbjub",
    "ipooj",
    "gvtfj",
    "pkjvf",
    "gvofj",
    "hbhpv",
    "zvvhv",
    "tbubo",
    "npblb",
    "fjupo",
    "lvvsp",
    "tfotv",
    "ubqqv",
    "iboej",
    "{pvzp",
    "ubzpv",
    "poebo",
    "kpvnf",
    "fonbo",
    "bonbo",
    "pnpoj",
    "lpvnb",
    "dibub",
    "ftbnb",
    "tbcpv",
    "bohpv",
    "sfjtv",
    "tbocj",
    "eblfo",
    "ptpcp",
    "bjkpv",
    "nvtfo",
    "b{vlf",
    "xbtib",
    "gvnfo",
    "ibqvo",
    "{vtbo",
    "sjlpf",
    "ofnvj",
    "ljtib",
    "bjnjo",
    "boufj",
    "ubonf",
    "fepsv",
    "ubjqv",
    "ljfeb",
    "lvolp",
    "joepv",
    "pvopv",
    "ipjsv",
    "cfoqj",
    "lfjxb",
    "qjfub",
    "kjufo",
    "ijokj",
    "szblv",
    "piftp",
    "bhbsv",
    "pvbxb",
    "ubtpv",
    "wjkpo",
    "ipqqv",
    "hzpvj",
    "sfjlp",
    "zpvgv",
    "hfebj",
    "po{po",
    "tfjzv",
    "sbjup",
    "lbuub",
    "iboxb",
    "dijlb",
    "sposj",
    "kvvhp",
    "cbkpo",
    "cbupo",
    "sjubo",
    "ebjoj",
    "jttbj",
    "gvjup",
    "ubjtv",
    "lpv{b",
    "sfonb",
    "ijqqv",
    "obpsv",
    "nbhfj",
    "ojpcv",
    "jzblj",
    "piblp",
    "btvub",
    "ebtfj",
    "ebjhj",
    "juflj",
    "lbkpv",
    "hboeb",
    "tijlb",
    "zptbj",
    "xbjgv",
    "bsbxb",
    "ifonf",
    "uftvv",
    "diftb",
    "hbsjb",
    "gvfuf",
    "czvgf",
    "kphbj",
    "qboup",
    "lpcvo",
    "bhfub",
    "ijcvo",
    "upipv",
    "poufj",
    "ubjlj",
    "ifsfo",
    "sfuup",
    "upvfj",
    "plpup",
    "tfutv",
    "lvnpj",
    "ibjsj",
    "tbvob",
    "lvxbj",
    "{fllv",
    "lbcbo",
    "cvsvj",
    "gpjsv",
    "upubo",
    "hbnpo",
    "gbsjb",
    "sbepo",
    "sjspo",
    "dijsv",
    "ipufj",
    "ijlfo",
    "nbkjj",
    "nzvsb",
    "xblbo",
    "wbkpo",
    "lbnjo",
    "lpolv",
    "gvjsj",
    "jszvv",
    "{pvhp",
    "pcfcf",
    "izpvj",
    "ojkpv",
    "kpvub",
    "ibllb",
    "ibonb",
    "qvsfo",
    "dibnf",
    "lpsbo",
    "lphpv",
    "tbibj",
    "sfjlj",
    "ebotb",
    "jjtbp",
    "efosp",
    "jtphv",
    "tivcp",
    "kbnbo",
    "bljtv",
    "ijsfj",
    "tbnpb",
    "lbqqb",
    "jfcbf",
    "ijtfo",
    "jnbnv",
    "hvqqj",
    "qfjkj",
    "pzphv",
    "btbtv",
    "qpoup",
    "tipsj",
    "tvjsv",
    "nbocv",
    "hfqqv",
    "btbof",
    "cvnbo",
    "fsbup",
    "nbtvj",
    "zpuup",
    "tbepv",
    "gfj{v",
    "ljufo",
    "hfolj",
    "ufjjo",
    "pobsb",
    "ubotb",
    "btfbo",
    "kjcvo",
    "hvepo",
    "lpebj",
    "pubnb",
    "plpnp",
    "ifjkj",
    "ebufo",
    "kptbo",
    "lbjob",
    "spefp",
    "pvtfo",
    "tblpv",
    "bsvlj",
    "lb{bo",
    "tivnj",
    "pvtvj",
    "gvvij",
    "tplbj",
    "pupsj",
    "nbbkj",
    "kjtpv",
    "bqbup",
    "opzvv",
    "sbobj",
    "nfotb",
    "hbsbo",
    "spllb",
    "uboqb",
    "zvvnp",
    "zvefo",
    "zvtij",
    "sfocp",
    "ubjzb",
    "ibsbo",
    "zbxbj",
    "ljohv",
    "fczpv",
    "nbfof",
    "bufob",
    "upllb",
    "kpvjo",
    "lbtpv",
    "lptfj",
    "tpvlb",
    "nbjlv",
    "objoj",
    "ibqqb",
    "cjkjo",
    "tibxb",
    "nbsjo",
    "cbspo",
    "qbjlb",
    "ipvep",
    "ojocj",
    "gvvnj",
    "kjfsj",
    "tijlp",
    "ibpup",
    "npcpv",
    "hptbo",
    "{pvhf",
    "nbeep",
    "vnbtf",
    "nbvtv",
    "njipv",
    "lfjbj",
    "sfblb",
    "efolj",
    "jcfsv",
    "cjcpv",
    "epupv",
    "nvubj",
    "iptfo",
    "jqqfo",
    "ibifo",
    "cbohj",
    "kvocj",
    "sjlpv",
    "tbejo",
    "nfjep",
    "zvnpb",
    "joufj",
    "jljlj",
    "pvofo",
    "lbolf",
    "fjlbo",
    "tbolb",
    "ubotp",
    "gvzvv",
    "gvuup",
    "sbeep",
    "tfoub",
    "ofsbj",
    "ojcvj",
    "cboup",
    "btfcj",
    "gjdib",
    "nfjup",
    "hbuup",
    "cflpo",
    "hbspo",
    "epvkj",
    "vfpup",
    "lbogv",
    "{bjjf",
    "tbtij",
    "zbtij",
    "tflbj",
    "tpcpv",
    "nvszp",
    "plvcb",
    "phbxb",
    "ljtvv",
    "hplbo",
    "lfsjj",
    "ljnfj",
    "jzbnj",
    "cbjlp",
    "kjozb",
    "pfobj",
    "upggj",
    "ptbnv",
    "lbepv",
    "npipv",
    "tijep",
    "tpufj",
    "ufokj",
    "gvtpo",
    "ejkpo",
    "bljlp",
    "xbjqb",
    "cjlfj",
    "bocbj",
    "lboup",
    "cbjlv",
    "tivtv",
    "epvsp",
    "ipvxb",
    "lpvzb",
    "fosfo",
    "zplbo",
    "nvsfj",
    "sjsbj",
    "tvupv",
    "tvjtp",
    "ljlfj",
    "tbokp",
    "tpv{v",
    "psvej",
    "cjspv",
    "ephpv",
    "zbutv",
    "foebo",
    "vxblj",
    "kvcbo",
    "zpljo",
    "qjbsv",
    "lfjsj",
    "difsj",
    "vsbkj",
    "pojsv",
    "opspj",
    "lfjkj",
    "fjnfj",
    "pzpcj",
    "ufoxb",
    "kvooj",
    "jbutv",
    "tbljo",
    "tbvkj",
    "upvoj",
    "ljuup",
    "gvlpv",
    "bebop",
    "vtvsv",
    "{bokj",
    "ebjtv",
    "nbspo",
    "jhvsv",
    "jttfj",
    "ojtpv",
    "gvoov",
    "{pvlb",
    "ofufj",
    "ijtfj",
    "lpnbf",
    "bnjlj",
    "upplv",
    "nv{bj",
    "tfjfo",
    "cpjtv",
    "bpspv",
    "obfhj",
    "utvhj",
    "blfsv",
    "zpvfj",
    "ibqqv",
    "hpohv",
    "cpvup",
    "blfnj",
    "cbllp",
    "nvlbj",
    "opibv",
    "jfsbj",
    "cpjsv",
    "iphhv",
    "tiblv",
    "ipvlj",
    "kvokj",
    "utvsf",
    "cpvpo",
    "kjzvv",
    "ljkjo",
    "spohj",
    "kvipv",
    "kvojb",
    "ubolb",
    "hjolp",
    "kjdij",
    "hfozb",
    "hjibo",
    "vnbof",
    "lbo{b",
    "vofsv",
    "tbflj",
    "objub",
    "qjolv",
    "tvjnb",
    "kjolv",
    "lphbo",
    "plptv",
    "lbpsj",
    "sfzpo",
    "upspo",
    "lvplv",
    "tiplp",
    "sjtpv",
    "hfotv",
    "ljkvo",
    "ijobo",
    "{buub",
    "iboef",
    "eplvf",
    "lbouf",
    "cpljo",
    "tijkp",
    "lbobv",
    "lbokv",
    "gbolj",
    "kjfnv",
    "lpljo",
    "epotb",
    "gvllp",
    "dijhj",
    "sjzvv",
    "tptbj",
    "tfolb",
    "hblvj",
    "njsfj",
    "epvhj",
    "gvllb",
    "tbjsp",
    "nfjbo",
    "blbnv",
    "sbjhb",
    "ufotv",
    "btvnj",
    "bcjtv",
    "zpebo",
    "jocpv",
    "opvkv",
    "foljo",
    "dijpo",
    "upibo",
    "joubo",
    "tfohj",
    "fokjo",
    "lbtvj",
    "bspib",
    "tbplp",
    "eblpv",
    "cvhfo",
    "ijipv",
    "sbotv",
    "tiptb",
    "sblbo",
    "dijup",
    "ojpcf",
    "tpvsv",
    "nvcpv",
    "optij",
    "cfsfo",
    "hvbcb",
    "tfuub",
    "opufo",
    "cvllp",
    "sjohp",
    "epvnb",
    "tp{bj",
    "kpnfj",
    "xbjqv",
    "bjcpv",
    "hbjlb",
    "zvvlp",
    "lfoqb",
    "pokvo",
    "vfcbo",
    "spvsp",
    "sjohv",
    "cpuup",
    "juufo",
    "hbjep",
    "gv{vj",
    "epvlj",
    "ebohj",
    "ibotp",
    "utvup",
    "lbebj",
    "{bozp",
    "kjefo",
    "jtblj",
    "tbcfj",
    "jopsj",
    "jljpj",
    "ofhbj",
    "ijjub",
    "psvhv",
    "fcjnp",
    "lbolj",
    "kjlpv",
    "jcjlj",
    "hvnpv",
    "ljhbo",
    "iblfo",
    "cjolv",
    "tipuf",
    "gvvhj",
    "tipjo",
    "cbtvo",
    "opolj",
    "plbvf",
    "ijibo",
    "tfljj",
    "pnpsj",
    "tiplj",
    "hb{fo",
    "kvvtv",
    "ip{fo",
    "sjkjo",
    "qbozb",
    "sfnpo",
    "qvsvo",
    "gvsbv",
    "sbllp",
    "vjoub",
    "cpvhj",
    "ljspv",
    "hbjhb",
    "ljhfo",
    "pnbtf",
    "upvzp",
    "kjojo",
    "lzplv",
    "ifjzv",
    "hpubj",
    "ibibp",
    "hpvlj",
    "hflbj",
    "zvolb",
    "ifjtb",
    "ubjlb",
    "lboej",
    "ufbuf",
    "jupnp",
    "splpv",
    "ifjsj",
    "plbhf",
    "dipcp",
    "zptfj",
    "zbljo",
    "ojlvj",
    "pczpv",
    "kbllv",
    "cpv{v",
    "ufljo",
    "pokvv",
    "bqvtv",
    "xbhpv",
    "npdij",
    "{vjjo",
    "ljcpv",
    "obogv",
    "lfjlv",
    "cvufo",
    "nvjhj",
    "lputv",
    "tpvkj",
    "lvftb",
    "kbjsp",
    "fsjtv",
    "spkkj",
    "ubhvj",
    "lpvbv",
    "lpzpj",
    "jnpop",
    "gvolv",
    "kbllb",
    "tivxb",
    "jzbtv",
    "tfjub",
    "gvvkj",
    "vfppj",
    "sboep",
    "opvtp",
    "zvvkj",
    "vsjlp",
    "btbpv",
    "vtfsv",
    "lpjop",
    "kvvtb",
    "eflbj",
    "qbtib",
    "hp{fo",
    "lplbp",
    "qbllv",
    "lpvip",
    "lpifj",
    "ojcbo",
    "jnbzb",
    "zbljf",
    "tibpo",
    "bttiv",
    "cfzpo",
    "ptblf",
    "uboqp",
    "jotfj",
    "{bjlp",
    "tpvsj",
    "nvkjo",
    "lvvtp",
    "fuplj",
    "psptv",
    "{folj",
    "bcvsv",
    "ebtbj",
    "ljlzp",
    "jlbeb",
    "j{fsv",
    "ipllj",
    "cboub",
    "ljolb",
    "upptb",
    "hjkpv",
    "vozpv",
    "cpubj",
    "ubutv",
    "tipkj",
    "efokv",
    "tvjkj",
    "cjijo",
    "cfohj",
    "xbjeb",
    "ijtbo",
    "tfjtv",
    "ljeep",
    "xbjsb",
    "epvtb",
    "opvlv",
    "bjipo",
    "jlpkj",
    "ljjsp",
    "ptivo",
    "njjsv",
    "ob{pf",
    "ljonv",
    "sjlbj",
    "kpojo",
    "tvljo",
    "nbutv",
    "npvhp",
    "tijhb",
    "zvveb",
    "zbibo",
    "ifjlj",
    "hzbsv",
    "ijojo",
    "pp{fj",
    "tvobp",
    "npuuf",
    "sbjpo",
    "ebjib",
    "psjbj",
    "lpozb",
    "ijokb",
    "zpvlb",
    "ljosv",
    "njtpv",
    "lptij",
    "tptbo",
    "tijnf",
    "tbjcv",
    "fcjof",
    "tbsbf",
    "ibjhb",
    "fupob",
    "spvlj",
    "ljcjo",
    "fosfj",
    "ipvzp",
    "tfohf",
    "bcbzb",
    "opllf",
    "nfjkp",
    "zpvib",
    "zbupv",
    "ibolb",
    "tvfub",
    "vsvgv",
    "gbvsv",
    "ifogv",
    "jjzpv",
    "gvtpj",
    "cpvfj",
    "kvvoj",
    "bcvlv",
    "lbplv",
    "fsbtb",
    "ufjlv",
    "boqfb",
    "tvjsp",
    "nbfcb",
    "tbsvo",
    "{bonv",
    "upocp",
    "nfjkj",
    "zvvcj",
    "nbfoj",
    "fsjbo",
    "lfbhf",
    "fllfo",
    "spvtv",
    "npvsb",
    "zpvkj",
    "tijnp",
    "lvkpv",
    "fbhbo",
    "lvsfo",
    "blb{b",
    "ibjcj",
    "tpvib",
    "kjnfj",
    "cfokp",
    "uflfj",
    "ubjep",
    "nvtib",
    "ifspo",
    "tpvjf",
    "lbjlb",
    "cjbnf",
    "dijkj",
    "obutv",
    "gvtij",
    "ptplv",
    "tbtpj",
    "hftvj",
    "ufllj",
    "lbjtb",
    "cjnbo",
    "utvnv",
    "lpjkj",
    "sfotb",
    "upsjf",
    "fjzvv",
    "ebfuf",
    "qvtbo",
    "efoxb",
    "qpb{v",
    "bplpv",
    "bupnv",
    "hbolp",
    "divub",
    "lbozv",
    "kjnbo",
    "ubolj",
    "jgvlv",
    "sboib",
    "zbcvo",
    "cpspj",
    "jtijo",
    "bjcvo",
    "epoup",
    "fuplv",
    "dijbo",
    "zpvhf",
    "dijlj",
    "kpjtv",
    "pocjo",
    "ufoqp",
    "sfohb",
    "bhpsb",
    "cbutv",
    "kbosv",
    "hvsfj",
    "qfolj",
    "fj{pv",
    "ofjsv",
    "biplf",
    "febsj",
    "qbdij",
    "ufo{b",
    "vxbcf",
    "vhplj",
    "ebefo",
    "qbeep",
    "blvtf",
    "ifjcb",
    "upvhp",
    "nv{bo",
    "tvjcj",
    "fjhpv",
    "tiptv",
    "ufjib",
    "lfjlb",
    "lvjlj",
    "blbnf",
    "kvhpo",
    "hpcbo",
    "lpfsv",
    "bsbtb",
    "vsbsb",
    "ijuup",
    "tvopv",
    "opuup",
    "ubjtb",
    "zpvjo",
    "hplpv",
    "b{plv",
    "sfbsj",
    "difsp",
    "tbjip",
    "ljibj",
    "tboqv",
    "hbonb",
    "lzpkj",
    "nfjsv",
    "sbejp",
    "divvj",
    "qjoup",
    "lzphj",
    "hbefo",
    "hbohv",
    "tijtv",
    "ppbnf",
    "ubggj",
    "jszpv",
    "sphbo",
    "ofllv",
    "plfsb",
    "sbtfo",
    "joupv",
    "tvqbo",
    "pxbsj",
    "lbkvv",
    "bkjsv",
    "kpzvv",
    "speep",
    "nvdij",
    "tivcj",
    "ljqqv",
    "ljttv",
    "tbonp",
    "ubcvo",
    "ebosp",
    "nvjlb",
    "gvvzv",
    "tvjgv",
    "nftib",
    "bubsj",
    "zpcpv",
    "pdipb",
    "zpvtp",
    "ebj{b",
    "pqfsb",
    "kptiv",
    "jizpv",
    "lbonf",
    "vjo{b",
    "vsbnf",
    "pcjub",
    "foepv",
    "sjlfo",
    "ibolp",
    "lp{pv",
    "lpgvf",
    "vjohv",
    "upvsj",
    "opdij",
    "jolpv",
    "cpotp",
    "gvpcj",
    "tbjkj",
    "hfjhp",
    "zvllb",
    "tfosv",
    "gvubv",
    "utvcb",
    "sjhpv",
    "ojcbj",
    "ojvnv",
    "ufspv",
    "hfjhj",
    "cvocp",
    "hplfp",
    "kjuup",
    "cfutv",
    "upvcv",
    "gfbsj",
    "izvnv",
    "cbokp",
    "sjflj",
    "ijnbo",
    "btpcv",
    "kvv{b",
    "tijib",
    "ufjpo",
    "kjpnv",
    "ufonf",
    "cbocv",
    "ofoib",
    "njepv",
    "lpkpv",
    "sbdij",
    "kvcbj",
    "sfhff",
    "nfjpv",
    "sbpup",
    "cpkpv",
    "ubtiv",
    "lvqpo",
    "uboeb",
    "pzbkj",
    "blbov",
    "pnjlj",
    "opvnv",
    "qbubo",
    "bpjbp",
    "nbupo",
    "ebjzb",
    "tpnbo",
    "nfcbf",
    "ubjip",
    "buupv",
    "hzphj",
    "iblbp",
    "qfspo",
    "njupo",
    "plvsv",
    "ibtbj",
    "sjcfo",
    "upjlj",
    "jolfj",
    "nfotv",
    "zpvnb",
    "ijllj",
    "eboqv",
    "cvolj",
    "ipvhb",
    "cfotp",
    "ifeeb",
    "efzvp",
    "obubo",
    "sjqqv",
    "tfnbj",
    "bupoj",
    "ojhbj",
    "tvfsv",
    "zbcbj",
    "nzvsv",
    "ubjib",
    "tfoep",
    "jsblv",
    "cvtip",
    "tivpo",
    "lzpij",
    "ubjkj",
    "ububo",
    "fjipv",
    "vzplv",
    "lbeep",
    "cvoqb",
    "pobkj",
    "pzphj",
    "spupo",
    "sfjzb",
    "lpepv",
    "bnjep",
    "{vjkj",
    "lbzpv",
    "uptpv",
    "lpkjo",
    "ufjlb",
    "hjnbo",
    "pvipv",
    "lzpfj",
    "lbnbf",
    "ubkpv",
    "gvsjo",
    "epsfj",
    "ubdij",
    "lbibo",
    "ubonb",
    "kvgvo",
    "blvup",
    "fhbsb",
    "bupnf",
    "bxbtf",
    "eblbo",
    "ppcbo",
    "tvubb",
    "eboej",
    "hjlbj",
    "zvohv",
    "iptfj",
    "jublv",
    "gvnjo",
    "blb{v",
    "diblp",
    "lbjhb",
    "cvsfo",
    "tfolf",
    "ozvnv",
    "xbjzb",
    "ubjhv",
    "pnpup",
    "fhblv",
    "xbolp",
    "ijlbo",
    "hvdij",
    "szveb",
    "jokpv",
    "tblfj",
    "jhbub",
    "lbokp",
    "efocv",
    "bolbo",
    "jotpv",
    "gvjoj",
    "fcpsb",
    "gvibo",
    "ibotv",
    "qvsbv",
    "pkbnb",
    "nbjnv",
    "ofplj",
    "tvqfb",
    "lpxbj",
    "lbspv",
    "tfo{p",
    "plvsf",
    "lbcpo",
    "pojpo",
    "ubolv",
    "jlvsv",
    "ufplf",
    "pvtij",
    "bjspo",
    "psjkp",
    "jpolb",
    "tbdib",
    "psjnf",
    "foszp",
    "pifzb",
    "ojqqb",
    "gvibj",
    "ufjpv",
    "dijzv",
    "cpouf",
    "lpzvv",
    "pibkj",
    "uflfo",
    "bljnb",
    "tpupj",
    "kjzpv",
    "hjtpv",
    "vfjwv",
    "bhblj",
    "svohf",
    "ibspo",
    "lpohj",
    "pvcbj",
    "ebolj",
    "tblbf",
    "sbohf",
    "xbebj",
    "vodij",
    "lbtib",
    "tijej",
    "objkj",
    "hjtij",
    "ufpop",
    "efutv",
    "lfcjo",
    "fkjlj",
    "ufefo",
    "ifjlf",
    "pxbtv",
    "nvtpv",
    "spcpv",
    "pvifj",
    "tpbwf",
    "tvupb",
    "sjcpo",
    "sfjpo",
    "bcblv",
    "tvoob",
    "folfj",
    "lvlfj",
    "sbolb",
    "ibtij",
    "pvzpv",
    "opllb",
    "votfj",
    "sbolv",
    "jfibf",
    "bpupv",
    "nvvib",
    "ljsfj",
    "qvuup",
    "lfjup",
    "ufkpv",
    "tpuuf",
    "ijlvj",
    "lboep",
    "kvohj",
    "lpspo",
    "ifcjj",
    "lvhvj",
    "bjlpv",
    "nf{po",
    "ojcfo",
    "ijtpv",
    "lbjhp",
    "vnbzb",
    "tpepv",
    "ubjhp",
    "tfjcj",
    "oboup",
    "hfooj",
    "uptij",
    "cjefp",
    "lbjnv",
    "tbuuf",
    "efllb",
    "cbolb",
    "tbbcj",
    "jnjep",
    "peptv",
    "tpvcb",
    "ijkvv",
    "joqfj",
    "fonbj",
    "nvlbv",
    "kpuup",
    "jolbo",
    "ibjgb",
    "ljfsv",
    "njsbj",
    "dijnv",
    "tpvgv",
    "ijoup",
    "kpnfo",
    "ipvpv",
    "ejsfj",
    "tfjvo",
    "tfjlj",
    "zpcbv",
    "nfjhp",
    "jtvsv",
    "tivhb",
    "kpcvo",
    "vtbhj",
    "hbjzb",
    "ppjub",
    "cvoqv",
    "gvipv",
    "kvnpo",
    "nputv",
    "nbupj",
    "zvvnf",
    "zvlzb",
    "lfonb",
    "ppjoj",
    "nfuup",
    "p{blv",
    "sjlbo",
    "lzb{b",
    "ifcpo",
    "tfolj",
    "hjnfj",
    "tfcvo",
    "hjoxb",
    "ufblj",
    "fjtbj",
    "fnfsj",
    "tbjeb",
    "fuupv",
    "jzblf",
    "{voup",
    "lpvvo",
    "ibkpv",
    "bsjlb",
    "ibuup",
    "bnfij",
    "ipopp",
    "tblbo",
    "uflbo",
    "lppsj",
    "upebf",
    "hbspv",
    "lpvlv",
    "lbsjb",
    "up{bj",
    "kplpv",
    "optpv",
    "ebdib",
    "epuup",
    "gv{fo",
    "qfqqb",
    "ptpgv",
    "eplbo",
    "tibnf",
    "focpv",
    "nvvop",
    "sjohj",
    "ifonv",
    "foufj",
    "svspv",
    "sbjtv",
    "epv{b",
    "zvtfj",
    "lzvvj",
    "xbtij",
    "pibsj",
    "pobhp",
    "fjdij",
    "ljnpj",
    "ojonv",
    "kptpv",
    "ljotb",
    "tbkpv",
    "kjlbj",
    "tibkj",
    "cvijo",
    "vnblv",
    "upoeb",
    "ovhvv",
    "zpvkp",
    "ljlpv",
    "ljocp",
    "ljtvj",
    "wfoeb",
    "ljfgv",
    "{vnfo",
    "tvlfj",
    "xbtfj",
    "tipup",
    "vfkkj",
    "jhbsv",
    "kblpv",
    "hbllj",
    "hptfj",
    "xblbj",
    "nbohb",
    "pijsv",
    "qjfsp",
    "hpkvo",
    "cboeb",
    "ljijo",
    "njlbo",
    "hfspv",
    "hpsbo",
    "xbsvj",
    "epspv",
    "pnblf",
    "ovjnf",
    "utvsv",
    "tfsfo",
    "spuuf",
    "btvlj",
    "zvubo",
    "ljolj",
    "lbvnb",
    "dij{v",
    "fsjlb",
    "ebjwv",
    "jlbsj",
    "pnpuf",
    "ljokp",
    "lbubj",
    "kpvfj",
    "bkjep",
    "ibjlb",
    "lbsvb",
    "hvbop",
    "qpeep",
    "kpcff",
    "cbszv",
    "pipof",
    "ubjnb",
    "tij{v",
    "lpjlj",
    "ijjpo",
    "jfkvv",
    "sbjob",
    "ijtvj",
    "gvcvo",
    "tpvbo",
    "sjtbo",
    "focbo",
    "nfotp",
    "fjtpo",
    "efbsv",
    "qjbsj",
    "lbsfj",
    "{fojo",
    "kjoob",
    "boobj",
    "njsvo",
    "ipv{v",
    "jzbfo",
    "iboub",
    "vnjcf",
    "v{vsb",
    "upouf",
    "tivsj",
    "qpdij",
    "jlboj",
    "sj{bj",
    "tbopv",
    "cfo{v",
    "gphhv",
    "ojsvj",
    "upozb",
    "ufohp",
    "tijjf",
    "v{vlv",
    "kvzpv",
    "b{vtb",
    "kvflj",
    "jfljo",
    "zpipv",
    "cjhjo",
    "ubosj",
    "vtvsj",
    "dibup",
    "spjep",
    "gvifo",
    "tfj{b",
    "sjoup",
    "lpsfj",
    "ipzvv",
    "cbhhv",
    "tfjkb",
    "ibjnf",
    "ijoep",
    "sbcbo",
    "nbgjo",
    "{fjlb",
    "tfhvf",
    "spvnv",
    "upjsf",
    "lptib",
    "tvjfj",
    "tipnv",
    "blbbj",
    "hjcpo",
    "npzbj",
    "hvlpv",
    "{bjsj",
    "ojhpv",
    "ptblj",
    "tijsb",
    "lbjlp",
    "opllv",
    "kjsfj",
    "vnjoj",
    "cbjlb",
    "hpibo",
    "vofsj",
    "qfufo",
    "qbohb",
    "jtvlb",
    "ibqbo",
    "lfjlj",
    "cbjfo",
    "vopnj",
    "tvlvj",
    "ibjib",
    "gvifj",
    "ubtbo",
    "cbohb",
    "bszvv",
    "sjzpo",
    "cboqv",
    "cbjzb",
    "lvsbj",
    "ibupv"
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
    shareText: "\u65E5\u672C\u8A9E\u306EWordle\uFF08\u30ED\u30DE\u30B8\uFF09\n#{day}\n{guesses}/6\nhttps://wordle-jp.netlify.app/\n"
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
