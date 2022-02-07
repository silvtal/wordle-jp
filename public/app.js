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
    "ebjhp",
    "sjqqv",
    "ubocp",
    "tbplb",
    "lbolv",
    "qjnbo",
    "tivtv",
    "xbhpv",
    "cbsvo",
    "nfjub",
    "ljepv",
    "utvzv",
    "ebsjo",
    "kjtpo",
    "zvvxb",
    "pkjlf",
    "qbqvb",
    "tivfo",
    "sfjej",
    "kpvcv",
    "pibib",
    "ufoef",
    "lfjlj",
    "ljeep",
    "lpvcj",
    "ojosj",
    "ljutv",
    "gvocp",
    "wfspb",
    "lbipv",
    "ofjcj",
    "hfobo",
    "hvspv",
    "polpv",
    "hvolb",
    "vsjof",
    "btv{v",
    "ifoib",
    "zbebo",
    "bojlj",
    "nposp",
    "tfebj",
    "ubhpo",
    "opvlj",
    "ubutv",
    "cjdib",
    "tfokj",
    "ljlbj",
    "jlbeb",
    "{vtbo",
    "tphbo",
    "gfoeb",
    "ifjzb",
    "ibooj",
    "nbzpv",
    "ipufj",
    "jubsv",
    "lfolj",
    "ppjtb",
    "jqqfo",
    "tbplv",
    "polfj",
    "lbnbv",
    "tijbo",
    "hb{pv",
    "ojkvv",
    "kvvoj",
    "hpuub",
    "npbsf",
    "tivzv",
    "tpvlj",
    "iptfo",
    "bupqj",
    "qpfkj",
    "lpvsb",
    "cjijo",
    "lbtbo",
    "ifoup",
    "lbdij",
    "{butv",
    "zvvtv",
    "jozpv",
    "sjofo",
    "cbohj",
    "ubjij",
    "gvzpv",
    "psjlj",
    "lzb{b",
    "tivhp",
    "zbkpv",
    "zbolj",
    "zbolv",
    "iptbj",
    "ubebv",
    "lvqpo",
    "xbjsj",
    "bplbj",
    "ubjbo",
    "bojkb",
    "{vllv",
    "joubo",
    "dijhp",
    "tbtij",
    "kjufo",
    "tbjgv",
    "upv{b",
    "lpvip",
    "kvvkj",
    "efnpo",
    "cbjeb",
    "bebkp",
    "bcbsb",
    "sfjcb",
    "obobf",
    "tpvpv",
    "jubsj",
    "tvebo",
    "hjnbj",
    "plvtv",
    "jcfsv",
    "{folv",
    "tfosb",
    "zvtbj",
    "zvfzv",
    "hptip",
    "lbubj",
    "kjefo",
    "nvkvo",
    "lbllj",
    "spepo",
    "kpvub",
    "lplpb",
    "hpipo",
    "ifoqj",
    "ljtij",
    "bcfsv",
    "ofllv",
    "tbhpv",
    "kjhhv",
    "plbnj",
    "hpnfo",
    "gvhfo",
    "johpv",
    "npvgv",
    "ibupv",
    "tijnj",
    "pnplj",
    "iblfj",
    "gbohv",
    "ijubo",
    "nbvtv",
    "lpvhb",
    "cbjup",
    "tipoj",
    "hbcpv",
    "blvcb",
    "hbupv",
    "qpsjp",
    "hpvcv",
    "tpvhp",
    "ipvcj",
    "lvsfo",
    "ibotp",
    "diplb",
    "hjlpv",
    "ipvjo",
    "flpkj",
    "{pokj",
    "lbsfj",
    "vnjif",
    "ipvfj",
    "ebvej",
    "bopep",
    "ufvtv",
    "kjifo",
    "ljllb",
    "xbkvo",
    "phzpv",
    "peblv",
    "nfllb",
    "tijov",
    "cbejo",
    "bjtij",
    "tpvhb",
    "hvsjo",
    "sjufo",
    "bsbnp",
    "bjlpo",
    "ubjqv",
    "sjqfb",
    "lpjop",
    "gv{bj",
    "tijnb",
    "wbkpo",
    "uboej",
    "sjtij",
    "eptpv",
    "cpvsb",
    "ljonf",
    "lblvv",
    "ojfsv",
    "nvsfj",
    "jfsfj",
    "jqqbj",
    "ubllb",
    "tivlv",
    "ipvsv",
    "ebnjo",
    "fobkj",
    "qbvsj",
    "jllpv",
    "kjozb",
    "lvspo",
    "jobtb",
    "ojllb",
    "lzbej",
    "ibotb",
    "gvsfb",
    "cbjvf",
    "hjhfj",
    "nfbuf",
    "epzpv",
    "ubpsv",
    "lblbo",
    "epv{f",
    "ubjtv",
    "kjzvv",
    "tijfo",
    "joepv",
    "gvopv",
    "lpebj",
    "qpotv",
    "tp{fj",
    "ljubf",
    "upufj",
    "lfibj",
    "folbo",
    "ufufj",
    "ejohp",
    "ufoqp",
    "epebj",
    "ijnfj",
    "nbgjo",
    "lpolj",
    "cbebj",
    "qfjef",
    "tbjep",
    "vsjuf",
    "bopnj",
    "lfolp",
    "ufljj",
    "nvszp",
    "sfuup",
    "epnjf",
    "zpuuf",
    "lpufo",
    "tvhpj",
    "lbllp",
    "ufttv",
    "efoqb",
    "kvgvo",
    "bddij",
    "ubohj",
    "hptfo",
    "lbobj",
    "ubonf",
    "ubfnb",
    "tbtpv",
    "vupnv",
    "pjsbo",
    "objzb",
    "ufjtv",
    "pbtij",
    "cbkkj",
    "vfjcv",
    "tp{pv",
    "cpvsv",
    "tbonj",
    "npipv",
    "kvotb",
    "lvllv",
    "gjuup",
    "kvtfj",
    "ebolp",
    "bsbtv",
    "npfsv",
    "ibolv",
    "peplf",
    "zbpzb",
    "jnbnv",
    "qvsfo",
    "btvlj",
    "qbokp",
    "tbllb",
    "plljj",
    "sbufo",
    "lvjbj",
    "juubo",
    "jcbsb",
    "vsfsv",
    "epgjo",
    "ubebj",
    "uplfo",
    "ovlvj",
    "sbllv",
    "zbpsb",
    "tbllp",
    "ljocp",
    "tfubj",
    "plpup",
    "fjufo",
    "nbepj",
    "nfouf",
    "kbocb",
    "{bjjf",
    "divcv",
    "upo{b",
    "zptbj",
    "obhbj",
    "gvlbo",
    "bqjsv",
    "tijlp",
    "{btiv",
    "btbsj",
    "ojbhf",
    "ipocb",
    "lboej",
    "tivkj",
    "kpojo",
    "sfzpo",
    "czvgf",
    "kpvjo",
    "ipvgv",
    "xblbo",
    "lvsfj",
    "joflb",
    "kjtiv",
    "spvhf",
    "nfnjf",
    "hbqqj",
    "tfoup",
    "lbljo",
    "nvtpv",
    "blbsj",
    "tfhvf",
    "qjqqv",
    "sboqf",
    "szvup",
    "ijjlj",
    "ojtff",
    "ljtfj",
    "fljtv",
    "{vlbj",
    "lfohj",
    "gvfsv",
    "kpzvv",
    "lpoxb",
    "sbuup",
    "hffnv",
    "lbcfo",
    "lpgvf",
    "pokvo",
    "jebtv",
    "zpufj",
    "dipsv",
    "nbfcb",
    "{bqqv",
    "tfj{b",
    "dibup",
    "{pvlb",
    "gvjlv",
    "cjnbo",
    "ipbtv",
    "njpnp",
    "tptvv",
    "spvsv",
    "tpbwf",
    "gvonf",
    "lfocj",
    "uftij",
    "tijbj",
    "ejnpo",
    "lfupo",
    "ebjlv",
    "hf{bj",
    "ojonv",
    "tfjgv",
    "bkjup",
    "vjoub",
    "upvtb",
    "cpvgv",
    "tvvlj",
    "ufbsb",
    "cbo{v",
    "lbutv",
    "tijxb",
    "plpkp",
    "ljuuf",
    "pupnp",
    "lvonv",
    "uftvv",
    "cvtiv",
    "foplj",
    "hjibo",
    "nfokp",
    "lpoqp",
    "ubjib",
    "lvnpo",
    "spufj",
    "cbolv",
    "cveeb",
    "tfotb",
    "tivfj",
    "ibdij",
    "ibjub",
    "obohp",
    "jfnfo",
    "tibfj",
    "pufsb",
    "vdivv",
    "gvsvj",
    "utvnf",
    "fjtpv",
    "{bipo",
    "upubo",
    "ljcbo",
    "zpvhp",
    "ljolv",
    "fjtfj",
    "nfozv",
    "tvnpv",
    "ipvij",
    "fudij",
    "ijgvo",
    "uboub",
    "njipo",
    "cboop",
    "sbjhb",
    "vhplv",
    "blvub",
    "jovlp",
    "lfocv",
    "ojlvj",
    "cbsfj",
    "sfllb",
    "pljnf",
    "bojtv",
    "tpllj",
    "judij",
    "pjtib",
    "ptbkj",
    "joojo",
    "tijtb",
    "kpcff",
    "tfjkj",
    "{fosb",
    "{bjlb",
    "cfotp",
    "tibup",
    "ufibj",
    "kvhpv",
    "upcjo",
    "ijtip",
    "nvuub",
    "tipfo",
    "tbjsp",
    "iplpv",
    "lpvlb",
    "ipqqb",
    "gvspv",
    "pfutv",
    "fsflj",
    "zvcbb",
    "utvnb",
    "hbotb",
    "bufsv",
    "fjcjo",
    "cbtib",
    "bcvsb",
    "difsp",
    "hfljj",
    "tfdij",
    "plvep",
    "ljhbj",
    "gvhvv",
    "ijtbj",
    "nvhpo",
    "kjlbj",
    "lbjnv",
    "nbkjo",
    "hfonj",
    "nfj{v",
    "lbopv",
    "lpoup",
    "blbcb",
    "ljtpv",
    "lpepv",
    "iphbo",
    "{vtij",
    "tptpv",
    "{pvfo",
    "ifeep",
    "ofoof",
    "kjqqb",
    "lbtip",
    "kvvhp",
    "ijufj",
    "lpvfj",
    "ubnfo",
    "tfosj",
    "pljob",
    "sjejb",
    "ufzvv",
    "nvolv",
    "qvejo",
    "tbipv",
    "lptiv",
    "vfuup",
    "tibsf",
    "tpipv",
    "ijepv",
    "nb{vj",
    "ibjlv",
    "bobcb",
    "bufep",
    "nfttf",
    "ufipo",
    "tpvhv",
    "cblfj",
    "cbjjo",
    "tpobf",
    "ifjxb",
    "nvljo",
    "hvocj",
    "ojozb",
    "fsjlp",
    "jbogv",
    "tpvip",
    "cbsff",
    "ifipv",
    "vlbtv",
    "blbkj",
    "bnbtv",
    "hpvlb",
    "ofoqv",
    "kjbkj",
    "ipozb",
    "jovkv",
    "epuup",
    "lpnbf",
    "lblbv",
    "tijkp",
    "ufjnv",
    "tpojo",
    "epvef",
    "ijtiv",
    "ljfuf",
    "npupo",
    "nfocb",
    "cbjuf",
    "zbcbj",
    "nvjhj",
    "gbjcb",
    "lbjlb",
    "hplbj",
    "foszp",
    "upvtv",
    "pijnb",
    "jttpv",
    "kpvfj",
    "kvooj",
    "psjsv",
    "hpubj",
    "bzvnj",
    "tpvtb",
    "uplvv",
    "cjdij",
    "obpsj",
    "kpvgv",
    "vsvhb",
    "upvjo",
    "njzpv",
    "vxbtb",
    "tbotv",
    "ptpcp",
    "bsvup",
    "kjojo",
    "boobo",
    "ibnvv",
    "tbkpv",
    "fljsj",
    "nbutv",
    "gvhvo",
    "ibxbj",
    "kpv{v",
    "opqqp",
    "hbjkj",
    "cptfj",
    "kjnbf",
    "fsfsv",
    "ebifo",
    "spnfo",
    "ljdif",
    "tvzpv",
    "hveep",
    "sbobj",
    "sjnbo",
    "cfoep",
    "sbkjp",
    "npifb",
    "{ftfj",
    "nbjnv",
    "qjoub",
    "vnbsf",
    "sfjtv",
    "blvtp",
    "nbjsv",
    "sfblb",
    "ufjep",
    "bnbtb",
    "qfjtv",
    "svtij",
    "cfsfo",
    "hvhfo",
    "ibjcv",
    "upcjp",
    "psjbv",
    "dibsj",
    "gjohb",
    "zbibj",
    "ljosj",
    "phzbb",
    "pkjlj",
    "opvlb",
    "plbhf",
    "zvvfo",
    "jsfsv",
    "epv{p",
    "efcbo",
    "ubopv",
    "tbsbv",
    "upupv",
    "sfutv",
    "tijsp",
    "foubj",
    "ijojo",
    "upqqv",
    "ijebj",
    "gvlbj",
    "bspib",
    "plbtv",
    "blvnb",
    "plvoj",
    "hpohf",
    "ibjfj",
    "ojhvo",
    "lb{vp",
    "fsvhb",
    "lbonf",
    "spoep",
    "lpolv",
    "hjofo",
    "lfjfj",
    "qbsfo",
    "tbjlv",
    "lbcjo",
    "tblpv",
    "ljoij",
    "vhplj",
    "poupv",
    "njoup",
    "tbsjo",
    "jhzpv",
    "xbhpo",
    "hjopv",
    "vfqpo",
    "dijzb",
    "njsbj",
    "zvvfj",
    "njnpo",
    "ibllv",
    "puphj",
    "bpjnf",
    "lfuup",
    "vnbtf",
    "jtfsv",
    "tbtpo",
    "bljsb",
    "nbsvj",
    "npoij",
    "nbhfj",
    "butvj",
    "gvllv",
    "ipepv",
    "jlvfj",
    "nvlpo",
    "juflj",
    "opsfo",
    "jcpnf",
    "hpipv",
    "ebutv",
    "fljjf",
    "ob{pf",
    "lfllb",
    "pcbbo",
    "nbeep",
    "pvtfo",
    "pupob",
    "ubjnf",
    "pljif",
    "hjtbo",
    "spvuf",
    "ufoop",
    "bsbnv",
    "ebupv",
    "xbjzb",
    "qbuup",
    "sfjcv",
    "jubcb",
    "kjfjo",
    "spnjp",
    "ifjnf",
    "ufjsv",
    "utvlv",
    "vsbnb",
    "lfbhf",
    "tptfj",
    "uputv",
    "ufjfo",
    "efjhp",
    "pibkj",
    "pljcb",
    "lbnfp",
    "tfoqv",
    "lfjkv",
    "lpcvo",
    "ljuup",
    "kvijo",
    "kphbj",
    "cbcpo",
    "lpvlp",
    "lbptv",
    "nputv",
    "tijuf",
    "jnpkp",
    "qpllf",
    "plbqj",
    "jcvlj",
    "ozv{v",
    "sjlfo",
    "ubtbj",
    "pvlbo",
    "lpzpj",
    "kvtij",
    "hftij",
    "tijej",
    "blvnj",
    "fsbcv",
    "sphbo",
    "btbhf",
    "pvofo",
    "jttvj",
    "tijlv",
    "bnjnf",
    "bnbep",
    "bsfcb",
    "cfosj",
    "sfjqv",
    "ibtib",
    "bpbtb",
    "lbjkj",
    "hplpv",
    "hbllv",
    "bnbub",
    "ebjeb",
    "utvob",
    "sfjzb",
    "zpolv",
    "lpifj",
    "pupsj",
    "tfoob",
    "gfotv",
    "f{bsb",
    "bufof",
    "hpvsv",
    "svj{v",
    "ublfj",
    "ebouf",
    "ojokb",
    "ebjlj",
    "sjlpo",
    "sjdij",
    "lbobo",
    "ibqqv",
    "kptij",
    "fsvnv",
    "sfolb",
    "ijbup",
    "tfolp",
    "hfuup",
    "gvvjo",
    "qjdij",
    "ibjnv",
    "diplv",
    "zvvoj",
    "blbof",
    "utvlb",
    "lj{bj",
    "bhblv",
    "ubcpv",
    "bsvhb",
    "ibvsb",
    "gvupv",
    "ebjsj",
    "lbzpv",
    "lvkpv",
    "ljlbo",
    "tvupv",
    "jlpsv",
    "psjcv",
    "vljlj",
    "bo{fo",
    "nvnfj",
    "sbhvo",
    "cvozb",
    "qbllv",
    "gvjsj",
    "tivsj",
    "ubtij",
    "ijuup",
    "lbobv",
    "xbjsv",
    "pspsb",
    "jnjob",
    "ptvsv",
    "gvuub",
    "jljlj",
    "tvfkj",
    "ojpcv",
    "ijjsp",
    "ebkvo",
    "qflbo",
    "cptij",
    "sjolb",
    "ppljj",
    "lvvlj",
    "tbo{v",
    "lzplv",
    "spkjb",
    "tipuf",
    "sjocv",
    "j{vsf",
    "ebfsv",
    "xbjqb",
    "joflp",
    "nfubo",
    "lpvsv",
    "lbokp",
    "spcbo",
    "objub",
    "ljvsj",
    "ljllv",
    "lvvcp",
    "ibttv",
    "ibnbo",
    "bsvlv",
    "lvgvv",
    "cpdij",
    "eplvf",
    "nvdij",
    "kvutv",
    "iboqb",
    "hphbo",
    "kpvip",
    "ljjoj",
    "lputv",
    "tvjlj",
    "vefxb",
    "nvjbv",
    "jtfzb",
    "tbotp",
    "ifjjo",
    "njebj",
    "tpvlp",
    "wpubo",
    "ibjsj",
    "lpvnb",
    "puplp",
    "kvotv",
    "voifo",
    "focvo",
    "jjnbf",
    "ofllj",
    "ubjeb",
    "lfjep",
    "hfozv",
    "kjkjo",
    "tibxb",
    "cphfo",
    "njoxb",
    "difjo",
    "ufnbf",
    "jsflf",
    "ptblf",
    "tbuup",
    "fhblv",
    "tbdib",
    "spvnv",
    "kpspo",
    "gvubj",
    "gvdij",
    "tbovb",
    "sjonp",
    "lzpfj",
    "vxblj",
    "ubcfo",
    "lbokb",
    "tfuup",
    "obogv",
    "fozpv",
    "spvlb",
    "vsbnj",
    "ifspo",
    "zpblf",
    "kbblv",
    "ijepj",
    "cfjtv",
    "bnfcb",
    "ofcpv",
    "foebj",
    "lfolb",
    "efoqp",
    "sjzpv",
    "hjkjo",
    "cpefj",
    "ojkpv",
    "lbocv",
    "gvhpv",
    "cvosj",
    "cfllp",
    "ibosv",
    "utvkj",
    "potfj",
    "kjoeb",
    "votpv",
    "zpxbj",
    "pojcj",
    "plpnp",
    "ebflj",
    "tvutv",
    "jcbsj",
    "lbebj",
    "ofibo",
    "hvnbj",
    "bkjnj",
    "ljhvv",
    "nvopv",
    "ufozv",
    "np{pv",
    "dijxb",
    "nvflj",
    "lbupv",
    "ublbo",
    "tivkv",
    "uftpv",
    "qfljo",
    "jsjnf",
    "kpvlj",
    "tijsb",
    "tiblf",
    "ubocj",
    "lfosf",
    "ubttp",
    "tbohj",
    "nv{bj",
    "lvsvv",
    "lfjhv",
    "pvdij",
    "tbhfo",
    "lpohp",
    "oflbo",
    "lppsj",
    "jjzpv",
    "cjolv",
    "nfnfj",
    "qfoof",
    "nbsjo",
    "npoup",
    "qfllv",
    "hfogv",
    "tvqqb",
    "ebjjo",
    "lpllb",
    "cpvzb",
    "plfzb",
    "tvuup",
    "kvvlb",
    "iponb",
    "ljnfj",
    "{pocj",
    "psbsv",
    "lboov",
    "nvgvv",
    "{folb",
    "objtv",
    "fhvsv",
    "pnbib",
    "bohpv",
    "xbjqv",
    "bupsj",
    "lbjuf",
    "ubjlv",
    "ebjcv",
    "pvupv",
    "lbjcb",
    "hbjfo",
    "obebj",
    "bobpv",
    "nboob",
    "ufspv",
    "ljubo",
    "kjufj",
    "tbjlb",
    "kpvkv",
    "hjbob",
    "ubtvv",
    "svspv",
    "zvebo",
    "ipttb",
    "jqqpv",
    "lfokb",
    "ptflj",
    "upttb",
    "tibhv",
    "ibjkj",
    "ipsjf",
    "hj{pv",
    "ibfnf",
    "hpiip",
    "kjsbj",
    "njopv",
    "zpvbv",
    "tbnvj",
    "pljsv",
    "poofo",
    "tfonv",
    "ebjnf",
    "gvtbj",
    "tbcpj",
    "gvflj",
    "foqpv",
    "lpkjo",
    "lpvuf",
    "tpipo",
    "tvqvo",
    "utvjf",
    "lfllj",
    "spbsv",
    "upvzv",
    "lbsbo",
    "ofuup",
    "epvlb",
    "kjnbo",
    "tpvhj",
    "{vibo",
    "upspj",
    "peflj",
    "upoef",
    "nzvsb",
    "fsvcp",
    "kblfo",
    "tpvlv",
    "bjofo",
    "kjeep",
    "gvtfo",
    "tbjeb",
    "ibonb",
    "gpupo",
    "botij",
    "gvllj",
    "blvkj",
    "lpv{v",
    "wboqv",
    "zplbo",
    "tivvf",
    "blbtv",
    "hbolb",
    "nfonj",
    "cjcpv",
    "nvvop",
    "gvufj",
    "opvib",
    "ozvnv",
    "efbsv",
    "bzbnf",
    "upqqb",
    "dijzv",
    "bjtip",
    "tijup",
    "jiblv",
    "hpkvv",
    "zpvsj",
    "ubjzp",
    "tvnbj",
    "tvjtv",
    "utvup",
    "nfllj",
    "objoj",
    "zblbj",
    "vtvef",
    "bhvsb",
    "cjubj",
    "ebcbo",
    "ufohb",
    "tbspo",
    "zvtij",
    "pzpcj",
    "uponb",
    "tipsv",
    "tboub",
    "qpfnv",
    "tvokj",
    "lzblv",
    "hbufo",
    "gbjsv",
    "ufjhj",
    "fjnjo",
    "ibjgv",
    "lbjvo",
    "hzbhv",
    "hvkvo",
    "sfonb",
    "ufkvo",
    "nbjlp",
    "lpvcv",
    "jospv",
    "sfjsb",
    "cpubo",
    "vjolv",
    "bjnpo",
    "kjtfj",
    "tblvj",
    "lpvcp",
    "lfosv",
    "zpvjf",
    "nflfo",
    "lpvtp",
    "kpvhp",
    "zvsbj",
    "nboqp",
    "ipvkp",
    "ofllp",
    "ijcpv",
    "tblbo",
    "sfjsj",
    "ib{vj",
    "hpojo",
    "foqfo",
    "blbnj",
    "sfeep",
    "tipkp",
    "pokjo",
    "kvubj",
    "jocbj",
    "lbhpv",
    "hbjtv",
    "lfpcj",
    "hfoep",
    "obfhj",
    "lbcpo",
    "foqfj",
    "poboj",
    "nvlpv",
    "ifjsp",
    "lpljo",
    "gvnfj",
    "cpkpv",
    "ubobo",
    "lfobo",
    "tivup",
    "btfsv",
    "efocv",
    "upvsv",
    "pvebj",
    "ljttv",
    "bsbuf",
    "vfupv",
    "tfjbj",
    "njtpv",
    "nbohb",
    "epeep",
    "lfjhp",
    "lfj{v",
    "nvlvj",
    "lfjcv",
    "hjufj",
    "hpcbo",
    "nbfof",
    "lfolv",
    "btftv",
    "xblzp",
    "cbupo",
    "ibpsv",
    "bzvnv",
    "bnjop",
    "qvsbp",
    "lfotb",
    "zbcpv",
    "lblpj",
    "tbjfj",
    "qbveb",
    "ipv{b",
    "cjtbj",
    "npblb",
    "lpouf",
    "iplbo",
    "hfotp",
    "bcpup",
    "njupo",
    "fohfj",
    "tvspv",
    "tpgvp",
    "ufbuf",
    "tibcv",
    "zbupj",
    "npolp",
    "tvlbj",
    "sbptv",
    "hfohp",
    "{bwjf",
    "bjnbj",
    "ipvnv",
    "kpvtp",
    "nbhbp",
    "wfjsv",
    "oboqb",
    "tibnv",
    "ijhbo",
    "fuptv",
    "lbtiv",
    "hpobo",
    "cfjcj",
    "lboob",
    "bnjsv",
    "hjsfj",
    "epkjf",
    "ibjkp",
    "ibjlp",
    "lbuub",
    "ibtbo",
    "bjlzv",
    "sbonp",
    "jubnv",
    "kpvnv",
    "nvkjo",
    "ljobo",
    "tbjcj",
    "vsbnv",
    "dibib",
    "kbjsp",
    "bsvsv",
    "blvsb",
    "sjzpo",
    "lfocb",
    "jtphj",
    "hbvtv",
    "upvzb",
    "spllv",
    "ijjub",
    "iblvb",
    "tphbj",
    "splfo",
    "lpoqb",
    "podij",
    "hjonj",
    "pebuf",
    "kvosp",
    "kjlfo",
    "bepcj",
    "lpvkp",
    "bebob",
    "upvhf",
    "ufohv",
    "tijfb",
    "jnbkv",
    "lvftb",
    "kjcpv",
    "jxbsf",
    "cfolj",
    "vnbnf",
    "iboqv",
    "blvnf",
    "cbjlv",
    "tbzvv",
    "spvsj",
    "cpohp",
    "tvbob",
    "jdijj",
    "nftpv",
    "gvojo",
    "zvvip",
    "pvcpv",
    "fj{fo",
    "fupsv",
    "ibepv",
    "lzplj",
    "vuubf",
    "gbllv",
    "cpvkv",
    "{bjzp",
    "sjtfj",
    "hpvtb",
    "lboqv",
    "kpvup",
    "sjkpo",
    "pupup",
    "epubo",
    "jttij",
    "bcblb",
    "wjefp",
    "spvgv",
    "ebvjo",
    "hvvxb",
    "ofjsp",
    "np{{v",
    "lpvpo",
    "hjboj",
    "hvsjp",
    "bsjsv",
    "lfsjj",
    "lbjtv",
    "poblb",
    "ibohb",
    "plvhj",
    "kpspv",
    "lptfj",
    "nbotv",
    "lpopv",
    "ubcbo",
    "lbnpo",
    "obtij",
    "ubqjo",
    "gvjlj",
    "{focv",
    "jokpv",
    "tfqjb",
    "fnpup",
    "lvolp",
    "sjoup",
    "kpvhv",
    "hfijo",
    "lpvtb",
    "tijjo",
    "bsjtb",
    "qpqqv",
    "ljspv",
    "epsvj",
    "gbjub",
    "fjvub",
    "lpspv",
    "jzbfo",
    "ofhbj",
    "lbgvf",
    "plpsv",
    "ijhfo",
    "bcjub",
    "utvub",
    "kptiv",
    "vsbuf",
    "psfjo",
    "nzblv",
    "spvkp",
    "bxbsf",
    "ufbup",
    "tibsj",
    "kpuup",
    "obffj",
    "lvvij",
    "ibqqb",
    "bsblb",
    "upptb",
    "kboqb",
    "ebsjb",
    "qfufo",
    "lbifj",
    "objsb",
    "obokj",
    "kbjcv",
    "opvsj",
    "nvipo",
    "spllb",
    "jllbj",
    "ljolj",
    "ljkjo",
    "boofj",
    "fqpob",
    "upsjf",
    "efczv",
    "hvuup",
    "tibhj",
    "qboup",
    "svnfo",
    "qjsfo",
    "ljplv",
    "jttip",
    "{bjlp",
    "{vopv",
    "nfcbf",
    "epspb",
    "ijspj",
    "hjnpo",
    "ljdij",
    "njtpo",
    "ifokb",
    "lbtfj",
    "njcvo",
    "tfocj",
    "joblb",
    "vuflj",
    "nfjcp",
    "lbojo",
    "iboej",
    "sbnjb",
    "gvvhb",
    "sfjkj",
    "gvljo",
    "pnflp",
    "ipvxb",
    "cj{bj",
    "lbjhp",
    "nboup",
    "kpvcb",
    "cvsvj",
    "lfotp",
    "lfouf",
    "fotfj",
    "lbjlp",
    "lbkpv",
    "zvvhj",
    "cplpv",
    "hbubj",
    "{fotf",
    "cpsvo",
    "ifoob",
    "sfjlb",
    "fjubo",
    "cbjzv",
    "lfjgv",
    "jozvv",
    "upuup",
    "ubohp",
    "sbepo",
    "kjllb",
    "tbzpv",
    "ebtib",
    "hfjlp",
    "ebubj",
    "jubnj",
    "ofnvj",
    "lpvib",
    "sbjgv",
    "spsfo",
    "nfjoj",
    "fjljo",
    "sbttp",
    "hvojo",
    "gvsfj",
    "ojhpo",
    "tfjsj",
    "lbsjb",
    "ljocj",
    "ifosp",
    "kvipv",
    "lbtij",
    "cjpsb",
    "fjlpv",
    "zpnfj",
    "qputv",
    "ufjup",
    "ibkkj",
    "ibkpv",
    "hbspb",
    "pnbsv",
    "tpvjo",
    "ibspv",
    "ibsbj",
    "johjo",
    "ljonb",
    "qbupo",
    "jpojb",
    "nfoqv",
    "hfocp",
    "joupv",
    "tijcp",
    "dijip",
    "cjlbp",
    "pubxb",
    "jsboj",
    "bpjlb",
    "lbtpv",
    "lpbkj",
    "hzblv",
    "plbcv",
    "lvdij",
    "lpvhp",
    "hjufo",
    "nbqqv",
    "upohv",
    "tbocb",
    "ublpv",
    "cpifj",
    "hjtip",
    "nbjzp",
    "p{vlf",
    "tijtp",
    "tponv",
    "sboqj",
    "gfjep",
    "ifjib",
    "utvsj",
    "{fnbo",
    "lbkjo",
    "lvj{f",
    "zbtfj",
    "tpnfj",
    "lvspv",
    "ifjbo",
    "ubjkj",
    "epvjo",
    "uptib",
    "ojotp",
    "ipocv",
    "lfohp",
    "cbtip",
    "ofo{b",
    "ppbnj",
    "zptij",
    "divsf",
    "lblzp",
    "ufoxb",
    "pnpuf",
    "zplfo",
    "tijkv",
    "lvsjo",
    "{vlfj",
    "eblbo",
    "sjkkj",
    "njjsj",
    "ebjbo",
    "hptvj",
    "njnbj",
    "qbufj",
    "ljhbf",
    "tbjhp",
    "pvbxb",
    "efjsj",
    "svjlb",
    "efolj",
    "sfjfo",
    "obpsv",
    "lbozp",
    "iblbo",
    "objgv",
    "ebjtb",
    "kvvbj",
    "hbolv",
    "hjljo",
    "juufo",
    "joopv",
    "sjoqb",
    "bebnv",
    "bjkjo",
    "ubjhb",
    "fotbo",
    "eptfj",
    "tivvj",
    "jzbnj",
    "bubnb",
    "ipsvo",
    "vljnf",
    "ebj{v",
    "nbllj",
    "hjjuf",
    "jsvlb",
    "ebjnv",
    "spvpv",
    "{bllv",
    "lftpo",
    "svocb",
    "ebjnb",
    "fotpv",
    "sbcbo",
    "jtbnf",
    "kjhfo",
    "nfjsv",
    "ijlfo",
    "cbspb",
    "zpspo",
    "ijzpv",
    "svjjo",
    "tvxbo",
    "cvoqb",
    "lbqqb",
    "jotiv",
    "tfotv",
    "lpbsb",
    "kplfj",
    "tivcv",
    "tfoij",
    "hbjsp",
    "bpjsp",
    "lvspj",
    "obttp",
    "lfjsp",
    "nfjkj",
    "lbjjo",
    "tbupv",
    "ipvkj",
    "epsbj",
    "wjpsb",
    "nvlbj",
    "sj{bj",
    "joubj",
    "zvubo",
    "ojolj",
    "ifjpo",
    "kjolb",
    "vlfbv",
    "zvvlv",
    "lfonb",
    "plvsj",
    "tivjo",
    "pizpv",
    "bptij",
    "nvlvv",
    "bodij",
    "nvtfo",
    "qbogv",
    "difeb",
    "tpcpv",
    "jtbnj",
    "lvnjo",
    "tfocv",
    "jljtb",
    "pqfsv",
    "jopgv",
    "cbogv",
    "ifjjf",
    "tbupj",
    "epkjo",
    "vlfuf",
    "ibolb",
    "nfjep",
    "buppj",
    "hpvjo",
    "cpuup",
    "jobtf",
    "poebo",
    "cvijo",
    "cpubj",
    "npqqv",
    "lfjsj",
    "iptiv",
    "boqfb",
    "tplpv",
    "hbjij",
    "sjogv",
    "hbutv",
    "zpnfp",
    "ubupv",
    "nbzvv",
    "sfhbo",
    "dibkj",
    "kvvtb",
    "pkjsv",
    "iplfo",
    "dijfo",
    "zpebo",
    "vpllb",
    "tpkpv",
    "kjsfj",
    "ipjlv",
    "epvhb",
    "tvjsj",
    "kjeeb",
    "tpohv",
    "ptivv",
    "pgjtv",
    "gvebo",
    "tpvvo",
    "lfsvo",
    "sfllj",
    "xbsbv",
    "ubllv",
    "upeep",
    "lfofo",
    "cjfsb",
    "lfjib",
    "ufnvv",
    "gbsbp",
    "iblvv",
    "peflp",
    "cjzpj",
    "tbnpo",
    "tvjnb",
    "bocvo",
    "ipokj",
    "upsfj",
    "ebotv",
    "lpfzp",
    "zpohv",
    "vnjsp",
    "qjbgv",
    "nvlbf",
    "oflfj",
    "ebolj",
    "bsfcj",
    "kpvnf",
    "ebolv",
    "ufjnj",
    "lvsvj",
    "vsjlb",
    "juplp",
    "tpvcj",
    "lblfj",
    "ubjlp",
    "psjlp",
    "spvfj",
    "jlblv",
    "bljsv",
    "jobsj",
    "lpubf",
    "sjnfo",
    "ljlpv",
    "tipvj",
    "ebsvj",
    "nbsjb",
    "ojuup",
    "fsbnv",
    "lpvlj",
    "cvobo",
    "jutvv",
    "jspsj",
    "jupnp",
    "lptbo",
    "psvup",
    "hbsfo",
    "dijhv",
    "ofdib",
    "publv",
    "nvsvo",
    "xbjup",
    "juubj",
    "lpvjo",
    "oblbj",
    "{fokj",
    "kvvzv",
    "lbnfj",
    "jubnf",
    "lppsv",
    "ibjhb",
    "nvhfo",
    "folbj",
    "ipvlb",
    "jodij",
    "gvoip",
    "lvjlj",
    "kplbj",
    "josfj",
    "jspoj",
    "jovlb",
    "opvfo",
    "kjfnv",
    "ijtfo",
    "tibcb",
    "blvnv",
    "obocv",
    "lzplf",
    "nj{vp",
    "obolj",
    "hjtfj",
    "tivub",
    "ijcvo",
    "ufutv",
    "qpoqv",
    "ipfsv",
    "pgjtb",
    "nj{pv",
    "iboup",
    "npolv",
    "tfjsb",
    "njvlf",
    "kjkpv",
    "tvjqv",
    "jcvsv",
    "kjtip",
    "pqbsv",
    "jtvlb",
    "bogfb",
    "ijspv",
    "tpvlf",
    "lbufo",
    "lpvfo",
    "gvnbo",
    "lbfsj",
    "hptpv",
    "qzvnb",
    "iblpv",
    "ipvhb",
    "hpibj",
    "pcpsp",
    "obubo",
    "tijub",
    "putvf",
    "tibep",
    "tfjfo",
    "epcbj",
    "jnfkj",
    "cbtvo",
    "lbhfo",
    "ijfsv",
    "zbnbo",
    "kjcvo",
    "uplvj",
    "pibsj",
    "gvvtb",
    "cjufo",
    "sbosj",
    "hfocb",
    "ibubo",
    "lvepv",
    "lpvlv",
    "bsfgv",
    "ejpsv",
    "lbotb",
    "poubj",
    "lvtbv",
    "upvlb",
    "qbjpo",
    "kblfj",
    "zpdij",
    "lboqb",
    "ojcvj",
    "jubnp",
    "hpvnp",
    "piftp",
    "qbutv",
    "hfolb",
    "ptipv",
    "jotbo",
    "gvtbo",
    "fljlb",
    "lbjkp",
    "upouf",
    "joibo",
    "sfokb",
    "kjlfj",
    "lfupv",
    "ibfsv",
    "nftib",
    "ufjsj",
    "cbnfo",
    "ijlfj",
    "{vjnj",
    "kvosj",
    "vobhj",
    "offzb",
    "juufj",
    "fljnv",
    "pubnb",
    "gvcjo",
    "tpflj",
    "hbolj",
    "tvupo",
    "ibnfo",
    "cpcjo",
    "{fohj",
    "fsjup",
    "ptpsv",
    "tijjf",
    "fohbo",
    "ubokj",
    "tfkjo",
    "lpllv",
    "lvcvo",
    "nfibj",
    "upvlj",
    "upjub",
    "zpkpv",
    "pzphv",
    "{pvfj",
    "phbxb",
    "ijlpv",
    "zblfj",
    "{pllb",
    "tivnf",
    "blbhf",
    "ufjib",
    "hzpgv",
    "bjtpv",
    "dijqv",
    "bllbo",
    "npvtv",
    "pqvob",
    "ubooj",
    "ojhbj",
    "lbvnb",
    "{bcpo",
    "ijutv",
    "nfotb",
    "eboxb",
    "sjohj",
    "{bjsv",
    "tbjlp",
    "kvolb",
    "zpvuf",
    "ljtpo",
    "pokpv",
    "bnbnj",
    "ljlpo",
    "bsjkv",
    "tijhj",
    "tbjfo",
    "tfnbj",
    "pnjzb",
    "iblpo",
    "lbcbo",
    "hjbsb",
    "blvcj",
    "utvof",
    "ufjlj",
    "tijwv",
    "dijnf",
    "ufoip",
    "bzbtv",
    "uptip",
    "jnbeb",
    "npvsj",
    "pohvv",
    "lbjup",
    "hfosj",
    "kvobo",
    "hvspj",
    "nbfoj",
    "fnpkj",
    "tfokb",
    "ojebj",
    "blpep",
    "hpvhp",
    "cbutv",
    "obocb",
    "jxbzb",
    "nbnpv",
    "pzbep",
    "cbggb",
    "diptb",
    "iphhv",
    "lpcvj",
    "nfjup",
    "bjobj",
    "ubjsb",
    "pvubj",
    "jobnv",
    "lflbo",
    "lvlbo",
    "izblv",
    "lfjbj",
    "nbjlv",
    "gvtiv",
    "ubfsv",
    "lbfsv",
    "jjojo",
    "fo{vj",
    "ljonv",
    "ibtfj",
    "hzb{b",
    "ubjnj",
    "lpuub",
    "lpufj",
    "tibqv",
    "tfolj",
    "lvlvj",
    "{bohf",
    "zplfj",
    "hfokj",
    "ljtpj",
    "zbljf",
    "cbjsv",
    "lbotp",
    "vqqvo",
    "njllj",
    "pkjvf",
    "tblfo",
    "qjuup",
    "lbosv",
    "cpspj",
    "ljopo",
    "sjqqb",
    "zpvhv",
    "hj{fo",
    "tbtbf",
    "cvtpv",
    "upvbv",
    "jtivv",
    "joqfj",
    "spuuf",
    "ljqqv",
    "sbqqv",
    "njohf",
    "pnj{v",
    "objcv",
    "spsjf",
    "gboep",
    "ljufo",
    "lbsbf",
    "jqqbo",
    "hbvej",
    "lpvgv",
    "fsjlb",
    "jspbj",
    "nvhbj",
    "efoxb",
    "blfep",
    "gvkvo",
    "ebjlp",
    "po{po",
    "tbufo",
    "jdivv",
    "tbozp",
    "cpvlj",
    "kjlzp",
    "xbjsp",
    "hvtib",
    "upfoj",
    "ofebo",
    "hbjcv",
    "upefo",
    "dibnf",
    "jxbtf",
    "cjuup",
    "nfjpv",
    "ljgvv",
    "tpobj",
    "sjoep",
    "ijobo",
    "lbufj",
    "lpvtv",
    "nfhfo",
    "zptfo",
    "qbttb",
    "lfoup",
    "hvolj",
    "nfebo",
    "nfufo",
    "gvupj",
    "npvhp",
    "kbllv",
    "dijgv",
    "zvvlp",
    "pepsv",
    "tvqjb",
    "cv{bj",
    "tbsbj",
    "lpvhv",
    "zbllf",
    "ijqqv",
    "sfjep",
    "ipuup",
    "sfjhj",
    "tpspj",
    "njtfj",
    "pljzb",
    "nfejb",
    "gfbvf",
    "epvlf",
    "psvnv",
    "ptfsp",
    "qvsvo",
    "kjoub",
    "blbsv",
    "fepvj",
    "hbtij",
    "divub",
    "qjsfb",
    "cbufo",
    "spvij",
    "tibqp",
    "tvlpo",
    "ijtbo",
    "npnfo",
    "lbjxb",
    "nfjlb",
    "hvgvv",
    "lbj{v",
    "qpdij",
    "lfkpv",
    "jbutv",
    "ljtfo",
    "upsjp",
    "sfokj",
    "bjcjo",
    "lphbj",
    "sfjsv",
    "sjosj",
    "lbjfo",
    "ljebj",
    "fnpop",
    "jszpv",
    "lpbnj",
    "tfcvo",
    "lplbp",
    "bojnf",
    "fcpsb",
    "lbjbo",
    "ljtib",
    "flvcp",
    "lbjtb",
    "jtphv",
    "zpspj",
    "ofoqj",
    "pufuf",
    "lfjuf",
    "lfjup",
    "lfjsf",
    "kjtib",
    "lvsbj",
    "qjolj",
    "tiptb",
    "ibjgj",
    "bsbcb",
    "xbebj",
    "nfjhj",
    "ubhvv",
    "ftvqp",
    "tivnj",
    "gvsjf",
    "gpspv",
    "b{bnj",
    "ifjlb",
    "hvjup",
    "lbtfo",
    "jnjbj",
    "fufsv",
    "pvebo",
    "febnv",
    "phbnv",
    "kjqqv",
    "ijcpo",
    "ebqqj",
    "blvhj",
    "fsjzb",
    "lpvvo",
    "spcpv",
    "xbipv",
    "njolv",
    "obnbf",
    "kjcjf",
    "upsfo",
    "btbtf",
    "epnjo",
    "ufokj",
    "foupv",
    "uftip",
    "utvcv",
    "qzvkj",
    "lzpnv",
    "cpvpo",
    "fophv",
    "sbjeb",
    "vofsv",
    "hplbo",
    "dipcp",
    "lfjhb",
    "ebjfo",
    "votij",
    "nvipv",
    "jbokp",
    "cvsfb",
    "zpvep",
    "tibtv",
    "kvvlv",
    "tbtfo",
    "sbjtf",
    "ufeep",
    "jo{fj",
    "ubosj",
    "lbllf",
    "diplp",
    "lpjlj",
    "fsfcf",
    "cbllp",
    "joefo",
    "ojtbj",
    "upvub",
    "ifotv",
    "psv{p",
    "flblj",
    "tijcv",
    "lbolb",
    "ubjnv",
    "ofjsv",
    "hbojo",
    "lpvsp",
    "ojgvo",
    "ijefo",
    "nfjzb",
    "szblv",
    "ebjhj",
    "epjsj",
    "ljohv",
    "opupv",
    "szvkv",
    "sptfo",
    "jkjnv",
    "njcbf",
    "obolb",
    "uboup",
    "uflfj",
    "ofufj",
    "ebcfo",
    "ljljo",
    "njfsv",
    "tijnv",
    "hvsfo",
    "zphfo",
    "ljzpj",
    "ubjpo",
    "ijoup",
    "gvbkj",
    "cptvo",
    "kvtiv",
    "tvnbv",
    "npvlf",
    "bjhbo",
    "bnjcb",
    "nfnbj",
    "nvofo",
    "tfooj",
    "cvllv",
    "joejp",
    "bcvkb",
    "ojtfj",
    "hpzpv",
    "lbosj",
    "tfjhj",
    "nvuup",
    "ijnfo",
    "puphb",
    "gv{fj",
    "ofolj",
    "hbnbo",
    "ipvuf",
    "ebvnb",
    "ibolj",
    "upqqj",
    "lfjij",
    "gbjup",
    "pzbnb",
    "vsbip",
    "ubcjo",
    "lplzv",
    "njdij",
    "ojtij",
    "cvtij",
    "gvcfo",
    "tfjcv",
    "ebufj",
    "tfjlb",
    "nvubj",
    "boufj",
    "ubsjo",
    "sboeb",
    "hbokj",
    "ipvbo",
    "bttbj",
    "lpzvv",
    "nbsfj",
    "bolpv",
    "tbtbv",
    "jbgpo",
    "tbcfj",
    "czvup",
    "ipolj",
    "vfjub",
    "btbhj",
    "dijcj",
    "uplvo",
    "sjibo",
    "bnbsj",
    "tvqjo",
    "lfjzp",
    "zpjnf",
    "jllbo",
    "ljibj",
    "kjb{p",
    "cjspv",
    "pjxbj",
    "uplfj",
    "sjcpo",
    "sbjzv",
    "pzblv",
    "pcblf",
    "upllb",
    "ljfeb",
    "nfohp",
    "sbokb",
    "sfolp",
    "bsjob",
    "fjifj",
    "ljofo",
    "spvcb",
    "kjolv",
    "psvub",
    "tbohp",
    "cbsjp",
    "sfo{b",
    "kpipv",
    "ojupv",
    "fsvgv",
    "j{fsv",
    "pvfsv",
    "ptfkj",
    "hjipv",
    "fjofo",
    "jtflj",
    "kjkvv",
    "jsfcb",
    "cbtfo",
    "zvvzp",
    "pvhpo",
    "szvsj",
    "gvspb",
    "kjcbo",
    "lptfo",
    "cvnpo",
    "bjtbo",
    "opvep",
    "jepnv",
    "boubj",
    "polfo",
    "sjolv",
    "ebhpo",
    "bljcb",
    "sbohv",
    "svjkj",
    "nvhpj",
    "svjhp",
    "bxbtv",
    "lpdib",
    "cbsjo",
    "kpvlp",
    "cvozp",
    "voepv",
    "opspv",
    "lpvlf",
    "eptvv",
    "nptib",
    "sboup",
    "qvsfj",
    "fotib",
    "hptbo",
    "cvutv",
    "joofo",
    "pibob",
    "lvutv",
    "tptfo",
    "fblpo",
    "hjnpv",
    "ibzbj",
    "lbosp",
    "zbllj",
    "ip{po",
    "ljsbj",
    "obsbj",
    "jlbtv",
    "cplfj",
    "tbjup",
    "bufnp",
    "izpvj",
    "zvvlj",
    "voqbo",
    "updij",
    "fodij",
    "lbtbj",
    "pvifo",
    "diblb",
    "ptijf",
    "fjtib",
    "ebjlb",
    "tbjbv",
    "kvlfo",
    "tvnjb",
    "gvvgv",
    "objwv",
    "kptvv",
    "zbtvj",
    "objkj",
    "ufllj",
    "ljhbo",
    "npcpv",
    "tijkj",
    "lphbo",
    "ephhv",
    "pcjsv",
    "lblpv",
    "njkpv",
    "nvtfj",
    "hjohb",
    "uflpv",
    "lvplv",
    "bhflv",
    "lbohb",
    "ifonf",
    "lbftv",
    "zbspv",
    "tiplv",
    "pvsfo",
    "ibtiv",
    "jlbsv",
    "bsvcj",
    "lbnjo",
    "lbouf",
    "ljozv",
    "nfipv",
    "{pvzp",
    "njjsv",
    "bjupv",
    "opccv",
    "ofjwj",
    "cpoep",
    "lpvep",
    "jobhp",
    "lpjsv",
    "obsbv",
    "lpspo",
    "bojpo",
    "lvtbj",
    "sblbo",
    "jtblj",
    "xbsbj",
    "bsfop",
    "jxbob",
    "ljcjo",
    "nv{vj",
    "hjolb",
    "fsvhv",
    "hptij",
    "tbokj",
    "ebjkj",
    "cpvlp",
    "kvv{b",
    "ublbj",
    "fttfj",
    "zbtbj",
    "ubggj",
    "peplv",
    "lpubj",
    "b{vlf",
    "nbocb",
    "sjojb",
    "lvlfj",
    "ljsfj",
    "npspj",
    "bsbsf",
    "hpofo",
    "vlfbj",
    "tpvcb",
    "nbtij",
    "tptij",
    "tivij",
    "kpnfj",
    "joifj",
    "ipubj",
    "{fllv",
    "ipllf",
    "ipspv",
    "xbjlb",
    "lfjcj",
    "bhfsv",
    "dijlv",
    "hpeep",
    "ijqqj",
    "cfsvo",
    "jsplf",
    "qjbop",
    "fjtfo",
    "vnfsv",
    "ljcfo",
    "gfjtv",
    "kvocj",
    "potfo",
    "ejohj",
    "zvsvj",
    "tfocp",
    "nfjzp",
    "gpoup",
    "lbjgv",
    "izvnp",
    "kplpv",
    "jupnf",
    "njlpv",
    "lvnpj",
    "jotvv",
    "kjtvv",
    "nfupv",
    "pupnf",
    "nflbp",
    "joxbj",
    "nbdij",
    "jhvsv",
    "tvubb",
    "ebjpv",
    "ebjzb",
    "qjllv",
    "jlpup",
    "ubuub",
    "gvvib",
    "ibsbv",
    "kpcbo",
    "kbllb",
    "hpkpv",
    "ifolp",
    "ufolj",
    "lfsbj",
    "up{bo",
    "polbj",
    "ppbsf",
    "ibokj",
    "jublp",
    "vjuup",
    "utvzb",
    "zbqqj",
    "sbjpo",
    "npolj",
    "hbnpo",
    "tflpj",
    "ipoep",
    "sboqv",
    "ubofo",
    "dibnv",
    "lzpij",
    "tfjpo",
    "lvsbv",
    "ifokj",
    "dipvv",
    "lbonv",
    "bsbub",
    "tflfo",
    "gjsfp",
    "lbsvj",
    "kjtpv",
    "{bsjb",
    "bobub",
    "utvnj",
    "lpsbj",
    "lbopo",
    "lfokj",
    "dijub",
    "tvkjj",
    "tfsjo",
    "lfosj",
    "szveb",
    "qfjkj",
    "hjebj",
    "fo{bo",
    "blbfj",
    "hjgvo",
    "lzvcb",
    "ofokj",
    "tpvnv",
    "hvoup",
    "ifotb",
    "bpbkj",
    "xbjsb",
    "pnpnj",
    "epvhv",
    "tfohv",
    "tbflj",
    "ljijo",
    "jfepv",
    "ufjcv",
    "nbocp",
    "cfeep",
    "vonfj",
    "ipllj",
    "cvufo",
    "fbvfj",
    "hbebj",
    "eblvv",
    "ubhfo",
    "bofsv",
    "ibzbv",
    "ubdij",
    "tpveb",
    "spvtp",
    "upvkj",
    "lplfo",
    "ibllj",
    "lbhpo",
    "ebokj",
    "lzpvj",
    "cvubj",
    "upvib",
    "cjtvj",
    "cfohj",
    "nfjbo",
    "kvvnf",
    "upllp",
    "xbuup",
    "dijsv",
    "lzbsj",
    "njoof",
    "ufjsf",
    "pxbcj",
    "njtbp",
    "vfufo",
    "ojllj",
    "pipof",
    "upvcb",
    "tfjlv",
    "jsf{b",
    "sfo{v",
    "spvzb",
    "ljzpv",
    "tpvxb",
    "sbvtv",
    "tibnf",
    "ipjsv",
    "lpvzv",
    "vnflj",
    "bxbcj",
    "blvvo",
    "tvlpb",
    "bojnb",
    "cpvhv",
    "bpcpv",
    "nfjtv",
    "pepsj",
    "gvsvf",
    "nvcpv",
    "hvubj",
    "tfokp",
    "vtvcb",
    "jxblv",
    "ubozb",
    "czvsp",
    "zpvhj",
    "opvgv",
    "pvlpv",
    "ijtpv",
    "efjnv",
    "jcvtv",
    "vfccv",
    "npsjo",
    "joipo",
    "fkjlj",
    "zvfsv",
    "kpvzp",
    "bqvsj",
    "vfjup",
    "ipvsj",
    "ljjsp",
    "kjlpv",
    "npebo",
    "{vsvj",
    "ebjwv",
    "gvnpv",
    "tvfep",
    "btpcj",
    "ufjpv",
    "hjspo",
    "bttfo",
    "dijlb",
    "gvutv",
    "tbjlj",
    "bhbsj",
    "efllj",
    "lfdij",
    "tvvkj",
    "sbllj",
    "jocff",
    "fohfo",
    "tfjkb",
    "lphpv",
    "divob",
    "zvvhb",
    "ljokp",
    "jolpv",
    "ftvsv",
    "plvcj",
    "wbkjo",
    "sboep",
    "ipvtv",
    "ij{pv",
    "epvcv",
    "ibjfo",
    "lpocp",
    "lpohb",
    "hp{fo",
    "tpspf",
    "kpllj",
    "tijsj",
    "vsplp",
    "bupef",
    "blbhp",
    "upllj",
    "lbjhb",
    "{fhfo",
    "tf{po",
    "lbjij",
    "gvoep",
    "ipvup",
    "ifoqv",
    "lbhbj",
    "fotij",
    "ibtpo",
    "cjzpo",
    "{vhbj",
    "opibv",
    "zpvlj",
    "hputv",
    "hblpv",
    "jtipv",
    "ibnpo",
    "diblp",
    "botfj",
    "tbjhb",
    "cbuup",
    "lpjsf",
    "cfupo",
    "ebjov",
    "bubsv",
    "tfjkp",
    "npzbj",
    "tbtbj",
    "hpvhj",
    "ubjlb",
    "epspo",
    "tboqv",
    "ijsvj",
    "jqvsv",
    "ibosp",
    "jxbcb",
    "lpvbv",
    "fjubj",
    "tphvv",
    "epkpv",
    "tbolv",
    "ljifj",
    "gvepv",
    "lfjsb",
    "hftfo",
    "lvufo",
    "puflj",
    "cbqqv",
    "plvsb",
    "zpuub",
    "ufljo",
    "zpvgv",
    "ipsvj",
    "sbpup",
    "pqbtv",
    "kpvlb",
    "potib",
    "fokpj",
    "ibjop",
    "ifooj",
    "tbj{v",
    "hpvnf",
    "cfj{v",
    "ipvlj",
    "szpvf",
    "ipooj",
    "lzpub",
    "zbipv",
    "gfjlv",
    "tiblp",
    "hfebo",
    "cvtvj",
    "sjolj",
    "lvvsp",
    "ubotv",
    "lbonb",
    "njnbv",
    "ljosv",
    "fjlbo",
    "lj{pv",
    "zbsbv",
    "ubjsv",
    "qbjqv",
    "hblbj",
    "qpoup",
    "cjtbv",
    "nftfo",
    "hvtbj",
    "lzvvj",
    "czpvf",
    "cvsbo",
    "lpocj",
    "tivhj",
    "opvoj",
    "tbjkj",
    "tpspv",
    "cvupv",
    "ljlzp",
    "zvvij",
    "lpvsj",
    "hjoqp",
    "jzplv",
    "gvsbo",
    "zvvep",
    "tfj{v",
    "tivsv",
    "upvfj",
    "psfsv",
    "pljuf",
    "ifolb",
    "cflpo",
    "bobhp",
    "tplvj",
    "optpv",
    "cjnjj",
    "epvsj",
    "ifosj",
    "cvcvo",
    "sjutv",
    "tijcb",
    "zvlbj",
    "jdipv",
    "zvvhf",
    "ibjlj",
    "tbjhj",
    "foojo",
    "hjobv",
    "kjpnv",
    "qfuup",
    "lzbqb",
    "gvkpv",
    "qbsjb",
    "bolbj",
    "tvjlb",
    "nbolj",
    "tfpsj",
    "jubtv",
    "nbupo",
    "lpohj",
    "tfjep",
    "sjebo",
    "lbjsj",
    "nbtvj",
    "lponb",
    "tbgjo",
    "diftv",
    "cbsjb",
    "qpoep",
    "kpvhj",
    "qbolv",
    "sfnpo",
    "nfspo",
    "qjfub",
    "gvsbj",
    "tiplb",
    "zvolb",
    "lpvkv",
    "ubipv",
    "nbocv",
    "jlf{v",
    "zpvkv",
    "upojo",
    "njofo",
    "zpjlj",
    "eblpv",
    "nfjhb",
    "ibtvv",
    "lb{bo",
    "tfjop",
    "zptbo",
    "zbhbj",
    "xbifj",
    "ebllp",
    "ijkvo",
    "tvjfj",
    "zpcvo",
    "lpnpo",
    "sbjnv",
    "ojolv",
    "tbjnv",
    "jflzp",
    "ovhvv",
    "cbhfo",
    "xbjep",
    "sfjlj",
    "kjoob",
    "lvvtp",
    "ljlfj",
    "lfoqb",
    "zpvlp",
    "hjojb",
    "lvnfo",
    "gvlfj",
    "kboqv",
    "spoqb",
    "gvolb",
    "nbhhv",
    "ipzpv",
    "ljtvj",
    "qplbo",
    "lblbp",
    "zpvpo",
    "epsbo",
    "upipv",
    "tfutv",
    "nbkbo",
    "zpvkj",
    "tfjib",
    "lfjcp",
    "zbcbo",
    "lpvzb",
    "lfhfo",
    "ljipv",
    "ijlbf",
    "sjozv",
    "fjzpv",
    "lbgvo",
    "dipvj",
    "tputv",
    "zbohv",
    "foufo",
    "ibvtv",
    "tbtiv",
    "{bozp",
    "{pvip",
    "pnpsj",
    "tvlvv",
    "jjlbf",
    "sboob",
    "ufubo",
    "ozvtv",
    "spupo",
    "cpllb",
    "tvkpv",
    "bttfj",
    "nbkjj",
    "xbllb",
    "kvvlj",
    "spnbo",
    "jgvlv",
    "bcjsv",
    "fejub",
    "kbqqv",
    "vtvsb",
    "nbipv",
    "lbjzv",
    "ubptv",
    "nftfj",
    "lb{pv",
    "cpvnj",
    "npsbv",
    "ojolb",
    "tboep",
    "lfjkj",
    "tbspv",
    "ibtpv",
    "sfoup",
    "fonfj",
    "cvzpv",
    "nvefo",
    "sfjcj",
    "gvohj",
    "lpvhj",
    "lbuup",
    "ifcvo",
    "cvllp",
    "efqqb",
    "lbokj",
    "jopsj",
    "ufoqv",
    "ebipv",
    "zpvlv",
    "njipv",
    "gvszp",
    "cbjcv",
    "sjtbo",
    "dijcb",
    "svjij",
    "lvolb",
    "ipggb",
    "kpjtv",
    "ljupo",
    "ptbsb",
    "gpoeb",
    "lbozv",
    "tijlj",
    "cbkjo",
    "boibj",
    "ufjhp",
    "cjohp",
    "qbjsv",
    "bsvnj",
    "ojipv",
    "ipszp",
    "ufoqb",
    "jocvo",
    "lbzpj",
    "focpv",
    "bijsv",
    "tvqfb",
    "bupnv",
    "psblv",
    "cvsfj",
    "kjjnb",
    "lfjnf",
    "jllfo",
    "lbjsp",
    "fuplv",
    "uppsj",
    "tibnp",
    "lbepv",
    "psvgv",
    "ipoqp",
    "nfjlj",
    "pnpnf",
    "bkbsv",
    "ibj{f",
    "tbdij",
    "lptvj",
    "kpvij",
    "ijflj",
    "lpozb",
    "gvsvv",
    "lfotv",
    "hbcbo",
    "ljufj",
    "zpvcb",
    "qpvsv",
    "ofplj",
    "bhfzb",
    "bjsfo",
    "cpvhp",
    "lpcbj",
    "lvtij",
    "ubotb",
    "nvsvj",
    "zvtpv",
    "ptibo",
    "lblvj",
    "ubjpv",
    "fnfsj",
    "lbnfo",
    "fofnj",
    "{buup",
    "tfjtb",
    "gvubo",
    "ubjxb",
    "kptbo",
    "kjtij",
    "npveb",
    "cpvhf",
    "pkjhj",
    "sbttb",
    "nbttf",
    "lpqqv",
    "nfuub",
    "psvej",
    "npibo",
    "lvpub",
    "fcbtv",
    "tvpup",
    "epv{b",
    "zbnpp",
    "lbifo",
    "ublzp",
    "kbhpo",
    "hfonb",
    "iptpv",
    "cpllj",
    "qvsbo",
    "tfolv",
    "sjllj",
    "tijsv",
    "ljebo",
    "tpfsv",
    "tpebj",
    "lfjzv",
    "voufo",
    "qfohb",
    "bjtfj",
    "tboef",
    "ubnbv",
    "bsvgb",
    "lbjof",
    "tvjlp",
    "lpepo",
    "cpebj",
    "psfbv",
    "psplb",
    "lp{pv",
    "qjkjo",
    "njuup",
    "hbotp",
    "lpsbo",
    "uflbj",
    "pcplp",
    "sbjup",
    "ipoop",
    "gvtfj",
    "pkplv",
    "gvofj",
    "hbhpv",
    "zvvhv",
    "tbubo",
    "npccv",
    "fjupo",
    "lvvzv",
    "ufohp",
    "ubqqv",
    "iboep",
    "qbokj",
    "ubzpv",
    "pofhb",
    "kpvsp",
    "fonbo",
    "bonbo",
    "pnpoj",
    "lpvnv",
    "{botb",
    "ftbnb",
    "ufjkj",
    "bohzb",
    "sfjup",
    "tbocj",
    "eblfo",
    "upvhj",
    "bjkpv",
    "nvtib",
    "b{vlj",
    "xbtib",
    "gvnfo",
    "tbonb",
    "cbotv",
    "sjlpf",
    "ofoep",
    "ljtiv",
    "bjnjo",
    "bovtv",
    "nvlfj",
    "fepsv",
    "ubjup",
    "ljfgv",
    "lvopv",
    "jofeb",
    "pvsbj",
    "ipkvv",
    "cfoqj",
    "lfjzb",
    "qjifo",
    "kjuub",
    "ijotp",
    "tpufj",
    "vlbcv",
    "bhbsv",
    "vnflv",
    "ubtpv",
    "lb{fj",
    "ipqqv",
    "ibblv",
    "sfjop",
    "hbllj",
    "hfebj",
    "ppbkj",
    "dijpo",
    "sbjvo",
    "lbuuf",
    "iboxb",
    "vozpv",
    "sposj",
    "kvvhv",
    "cbkpo",
    "cbupv",
    "sjubo",
    "ebjoj",
    "jttfj",
    "gvkjo",
    "ebefo",
    "lpxbj",
    "sfopo",
    "ijsfj",
    "obptv",
    "nbibo",
    "vlbsv",
    "jzblv",
    "piblp",
    "btvub",
    "ebtfj",
    "ebjgv",
    "jupjo",
    "lbkvv",
    "hboeb",
    "tijlb",
    "upoeb",
    "xbjgv",
    "bsbxb",
    "ufjbo",
    "pxbsv",
    "diftb",
    "hbsjb",
    "gvfuf",
    "czpvv",
    "kphfo",
    "svutv",
    "lpdij",
    "bhfub",
    "ijdij",
    "hzpvj",
    "poufj",
    "ubjlj",
    "ifsfo",
    "pobsb",
    "pvkpv",
    "svcfo",
    "lbeep",
    "lvobo",
    "ibjtv",
    "tbvob",
    "lzbgf",
    "sbdib",
    "lbcbv",
    "utvhv",
    "gpjsv",
    "lpfsv",
    "hbocp",
    "gbsjb",
    "sbggb",
    "zvvcf",
    "dijsj",
    "ipupo",
    "ijljo",
    "nbllb",
    "nzvsv",
    "hbkpv",
    "tbuuf",
    "lbnzv",
    "lponf",
    "gvjup",
    "jtblb",
    "{pvhp",
    "pcfcf",
    "izvnb",
    "ojlbj",
    "kpvuf",
    "ibllb",
    "ibonj",
    "qvsjo",
    "diblv",
    "lpsfj",
    "tbufj",
    "tbibj",
    "sfjlp",
    "ebotb",
    "jjtbp",
    "efosp",
    "jttbj",
    "tivcp",
    "kbolj",
    "bljtv",
    "ijsjo",
    "tbnpb",
    "lbqqv",
    "jfcbf",
    "ijtij",
    "jnboj",
    "hvqqj",
    "qfjqb",
    "pzptp",
    "btbtv",
    "qpqqp",
    "tipsj",
    "tvjsv",
    "nbohp",
    "hfqqv",
    "btbof",
    "cvnbo",
    "fsbup",
    "tpvpo",
    "zpuup",
    "tbtpf",
    "gfj{v",
    "ljupv",
    "hfolj",
    "ufjjo",
    "pocbo",
    "qjqjo",
    "btfbo",
    "kjdij",
    "hvepo",
    "lpefo",
    "pubnv",
    "plpsj",
    "ifjkj",
    "ebufo",
    "kptfj",
    "lbjqb",
    "spefp",
    "vjoep",
    "ojtvj",
    "bsvlj",
    "lb{fo",
    "qbtij",
    "pvtvj",
    "gvvij",
    "tplbj",
    "puptv",
    "nbebo",
    "kjubj",
    "bqbup",
    "opzvv",
    "sbocv",
    "zvveb",
    "hbsbo",
    "tvqbj",
    "uboqb",
    "zbozb",
    "zvefo",
    "ijubj",
    "tijoj",
    "ubjzb",
    "ibsbo",
    "hvnpv",
    "ljokj",
    "fczpv",
    "nbfop",
    "bufob",
    "vo{bo",
    "kpvkj",
    "lbtvj",
    "lptib",
    "tpvlb",
    "nbjnb",
    "objpv",
    "ibqqj",
    "cjkjo",
    "ijifj",
    "nbspo",
    "cbspo",
    "qbjlb",
    "ipvep",
    "ojogv",
    "gvvnj",
    "kjhbj",
    "ifnjo",
    "ibpup",
    "npdij",
    "zpvhb",
    "{pvhf",
    "nbepv",
    "svohf",
    "nbzpj",
    "njjsb",
    "lfjcb",
    "ubolb",
    "efolb",
    "zbxbj",
    "cjbsj",
    "zbtiv",
    "nvupo",
    "iptij",
    "jqqjo",
    "ibifo",
    "ufolb",
    "kvohj",
    "sjlpv",
    "tbejo",
    "nfjgv",
    "zvnpb",
    "joupo",
    "jljpj",
    "pvopv",
    "lbolj",
    "fjkjp",
    "tbolb",
    "ubotp",
    "gvzvv",
    "gvuup",
    "tbnfo",
    "tfoub",
    "ofsbv",
    "ojdij",
    "cboup",
    "btfcj",
    "gjdib",
    "nfjvo",
    "hbuup",
    "cfoeb",
    "hbspo",
    "epvkj",
    "vfpup",
    "lbohp",
    "cfutv",
    "tvjup",
    "ebcpv",
    "tflbj",
    "jotfj",
    "nvtbj",
    "plvcb",
    "phpsj",
    "ljubj",
    "hplfj",
    "lftij",
    "ljnpj",
    "jzboj",
    "cbjlp",
    "kjo{v",
    "pfobj",
    "upggj",
    "ptbnv",
    "lbfef",
    "nplfj",
    "tijep",
    "jlpnj",
    "izv{v",
    "gvtpo",
    "ejkpo",
    "bljlp",
    "ipvpv",
    "cjlfj",
    "bocbj",
    "lboxb",
    "cbjpo",
    "lpjkj",
    "epvsp",
    "tvfhv",
    "lpv{b",
    "vkveb",
    "tpdij",
    "nvspo",
    "sjsbj",
    "ptpsf",
    "tvjtp",
    "ljlfo",
    "tbokp",
    "tpv{v",
    "psvep",
    "cjqqv",
    "ephpv",
    "zbutv",
    "foebo",
    "tfjcj",
    "kvflj",
    "zpljo",
    "qjbsv",
    "lfjtv",
    "diflp",
    "vsbkj",
    "pojsv",
    "opspj",
    "lfjlb",
    "fjnfj",
    "pzpcv",
    "cboeb",
    "kvosb",
    "jcblv",
    "tbljo",
    "tbvkj",
    "upvoj",
    "ljvnj",
    "gvlpv",
    "bebop",
    "vtvsv",
    "{bokj",
    "zpv{v",
    "nbspv",
    "jhvtb",
    "jttfo",
    "ojtpv",
    "gvoov",
    "sbeep",
    "ofutv",
    "tfjjf",
    "lpnbj",
    "bnjlj",
    "upplv",
    "ubj{b",
    "epotb",
    "cpjsv",
    "bpspv",
    "obfsv",
    "utvhj",
    "blfsv",
    "zpvfj",
    "ibqvo",
    "hpohv",
    "cpvup",
    "blfnj",
    "cbllv",
    "xbhfo",
    "opj{v",
    "jfsbj",
    "cpjsb",
    "ipifj",
    "jcjsv",
    "ipvlp",
    "kvokp",
    "utvsf",
    "cpvnv",
    "kj{fo",
    "vnbkj",
    "spohj",
    "kvlbo",
    "kvokj",
    "sfczv",
    "hjolp",
    "kjebj",
    "hfozb",
    "hjifo",
    "kjnfo",
    "lbplv",
    "efutv",
    "tbepv",
    "objup",
    "qjolv",
    "cpvcj",
    "kjonp",
    "lpibo",
    "plptv",
    "lbpsv",
    "sf{vo",
    "upspo",
    "lvpup",
    "tiplp",
    "sjtpv",
    "hfotv",
    "ljkvv",
    "{focj",
    "{buub",
    "iboef",
    "epllv",
    "lboup",
    "cpljo",
    "pnfhb",
    "lbocj",
    "lbolf",
    "gbolj",
    "kjfsj",
    "lpllj",
    "eponb",
    "gvllp",
    "dijhj",
    "zvvsj",
    "tptbj",
    "tfolb",
    "hblvj",
    "njsfo",
    "epvhj",
    "gvllb",
    "tbjsj",
    "nfjcj",
    "blbnv",
    "sbjij",
    "ufotv",
    "zpvsv",
    "bcjtv",
    "sbjub",
    "jocpv",
    "opvkv",
    "foljo",
    "dijnv",
    "upibo",
    "joufj",
    "tfohj",
    "fokjo",
    "lbtvv",
    "bspnb",
    "tbplp",
    "ebllv",
    "cvepv",
    "ijipv",
    "sbotv",
    "spkjf",
    "sbllb",
    "dijup",
    "ojpcf",
    "tpvsv",
    "nvdib",
    "zbtib",
    "cfspb",
    "upsbj",
    "tfuub",
    "opufo",
    "cvjbj",
    "sjohp",
    "epvnb",
    "tp{bj",
    "xbjlv",
    "ejsfj",
    "bjcpv",
    "hbjlb",
    "cjefp",
    "lfoqv",
    "tijzb",
    "tftiv",
    "spvsp",
    "sjohv",
    "cputv",
    "juupv",
    "hbjep",
    "gv{vj",
    "epvlj",
    "ebohj",
    "vfcbo",
    "bolbo",
    "lbebo",
    "spjep",
    "kjepv",
    "jtblp",
    "tbbcj",
    "jopsv",
    "jljsv",
    "ofhbv",
    "ijkpv",
    "psvhv",
    "fcjnp",
    "lbolp",
    "kjlvv",
    "jcjlj",
    "hvocb",
    "ljhfo",
    "iblfo",
    "cjolb",
    "lpvcb",
    "gvvhj",
    "tipjo",
    "cbufj",
    "opolj",
    "plbvf",
    "ijibo",
    "tfljj",
    "zpzvv",
    "tiplj",
    "hb{fo",
    "kvvzb",
    "ip{fo",
    "sjkjo",
    "qbozb",
    "sfocp",
    "qvtbo",
    "gvsbv",
    "sbllp",
    "jpoob",
    "cpvhj",
    "ljtbj",
    "hbjhb",
    "ljhpv",
    "pnbtf",
    "upvzp",
    "kjokb",
    "lzpsj",
    "ifjzv",
    "hpufo",
    "ibibp",
    "hpvlj",
    "hflbj",
    "tij{v",
    "ifjtb",
    "sfohb",
    "vtfsv",
    "ebosp",
    "jupzp",
    "splpv",
    "ifjsj",
    "plbhp",
    "zpvup",
    "zptfj",
    "zbljo",
    "ojocj",
    "pczpv",
    "kblpv",
    "cpv{v",
    "sjhpv",
    "pokvv",
    "bqvtv",
    "jolfj",
    "npebf",
    "lfjlv",
    "ljcvo",
    "obohj",
    "lfjnv",
    "cvubo",
    "nvjlb",
    "lpvbo",
    "tpvkj",
    "lvhvj",
    "kbkkj",
    "fsjtv",
    "spkkj",
    "ubhvj",
    "lpvcf",
    "vfkkj",
    "jnpop",
    "gvolv",
    "kbllj",
    "tivxb",
    "jzbtv",
    "tfjub",
    "gvvkj",
    "vfppj",
    "vnjfo",
    "opvtp",
    "zvvkj",
    "vsjlp",
    "btbpv",
    "lbogv",
    "lpjov",
    "kvvtv",
    "eflbj",
    "qbtib",
    "hvbcb",
    "lplfj",
    "qboeb",
    "lpvkj",
    "lpiip",
    "vudij",
    "jnbzb",
    "jzblj",
    "tibpo",
    "bttiv",
    "tvubo",
    "{pocb",
    "{bolj",
    "jotij",
    "pobkj",
    "tpvsj",
    "nvkpv",
    "lvxbj",
    "vxbhj",
    "psptv",
    "{folj",
    "bcvsv",
    "ebtbj",
    "ljnbj",
    "jlbef",
    "j{vnj",
    "ipllv",
    "cboub",
    "zpvtv",
    "zpvhf",
    "hjkpv",
    "tvupb",
    "cptvv",
    "tivcj",
    "tipkj",
    "efokv",
    "tvjkj",
    "cjhjo",
    "cfohp",
    "xbjeb",
    "ijtfj",
    "tfjtv",
    "ljefo",
    "tfjvo",
    "epvtb",
    "opvlv",
    "bjipo",
    "jlpkj",
    "ljkvo",
    "ptivo",
    "njkjo",
    "ofbhf",
    "ljopv",
    "sjkvo",
    "kpopv",
    "tvf{v",
    "nbuup",
    "npvkb",
    "tijhb",
    "uplpv",
    "zbibo",
    "ifjlj",
    "hzbsv",
    "ijokb",
    "pp{fj",
    "tvobp",
    "npuup",
    "sbjtb",
    "ebjib",
    "psjbj",
    "lppoj",
    "ijokj",
    "zpvlb",
    "ljotb",
    "njufj",
    "lptpv",
    "tptbo",
    "tijnf",
    "zblbo",
    "fcjof",
    "tbsbf",
    "ibjhp",
    "fupob",
    "spvlj",
    "ljcpv",
    "fosfj",
    "ipvzp",
    "tfohf",
    "bcbzb",
    "opllf",
    "tvljo",
    "zpvib",
    "zbupv",
    "ibolf",
    "tvfub",
    "vsvgv",
    "gbvsv",
    "ifogv",
    "jkblv",
    "gvtpj",
    "cpvfj",
    "kvvsj",
    "bcvlv",
    "lbpsj",
    "fsbtb",
    "ufjlv",
    "boqpv",
    "tvjsp",
    "nbfif",
    "tbsvo",
    "{bonv",
    "cvolj",
    "nfjkp",
    "zbzvv",
    "nbgjb",
    "zpvzb",
    "lfbob",
    "fllfo",
    "spvtv",
    "npvsb",
    "njlfo",
    "tijnp",
    "lvkvv",
    "fbhbo",
    "lvsjb",
    "blb{b",
    "ibjcj",
    "tpvib",
    "ubhhv",
    "cfokp",
    "tfosv",
    "ubjep",
    "nvtij",
    "ifutv",
    "tpvjf",
    "lbjlj",
    "cjbnf",
    "dijkj",
    "obuup",
    "gvtij",
    "ptplv",
    "tbtpj",
    "hftvj",
    "ojcbj",
    "lbjtp",
    "cjlpv",
    "utvnv",
    "lpjlb",
    "sfotb",
    "speep",
    "fjzvv",
    "ebfuf",
    "vsjvf",
    "efoup",
    "zvvnp",
    "bplpv",
    "upoup",
    "hbolp",
    "divsv",
    "lbo{b",
    "kjnfj",
    "ubolj",
    "jhblv",
    "sboib",
    "zbcvo",
    "cpouf",
    "jtijo",
    "bjcvo",
    "epoup",
    "fuplj",
    "dijbo",
    "ufonb",
    "dijlj",
    "kpkjb",
    "pocjo",
    "lvcpv",
    "sfojo",
    "bhpsb",
    "cbuub",
    "kbosv",
    "hvsfj",
    "qfolj",
    "volpv",
    "ofjtv",
    "biplf",
    "febsj",
    "qbdij",
    "ufo{b",
    "vxbcf",
    "jlzpv",
    "zbtij",
    "qbeep",
    "blvtf",
    "ifjcb",
    "upvhp",
    "nv{bo",
    "tvjcj",
    "fjhpv",
    "tiptv",
    "jjjsf",
    "{vjjo",
    "lvjsv",
    "blbnf",
    "kvhpo",
    "hpcpv",
    "lpftv",
    "bsbtb",
    "vsbsb",
    "ijxbj",
    "tvopv",
    "opuup",
    "ubjtb",
    "zpvjo",
    "hplvv",
    "b{plv",
    "sfbsj",
    "difsj",
    "tbjib",
    "ljibo",
    "tboqp",
    "hbonb",
    "lzplb",
    "nfjtp",
    "sbejp",
    "divvj",
    "qjoup",
    "upvgv",
    "hbefo",
    "hbohv",
    "tijtv",
    "ppbnf",
    "ubf{v",
    "jszvv",
    "spfcf",
    "ofnfb",
    "plfsb",
    "sbtfo",
    "jovkj",
    "vnbof",
    "pxbsj",
    "lblbb",
    "bkjsv",
    "kp{bo",
    "spebo",
    "nvdip",
    "tivbv",
    "ljsbv",
    "zptpv",
    "tbonp",
    "upvij",
    "eboqv",
    "nvjnj",
    "gvvzv",
    "tvjgv",
    "nftij",
    "bubsj",
    "zpcpv",
    "pdipb",
    "wjkpo",
    "ebj{b",
    "pqfsb",
    "zplpv",
    "jizpv",
    "lbonj",
    "vjo{b",
    "vsbnf",
    "pcjub",
    "foepv",
    "sjlbo",
    "ibolp",
    "vlfsv",
    "lpgvv",
    "vjohv",
    "upvsj",
    "opdij",
    "jolzp",
    "cpohv",
    "gvpcj",
    "tbjip",
    "hfjhp",
    "zvllb",
    "tfosp",
    "gvubv",
    "utvcb",
    "sjflj",
    "ojcbo",
    "ojvnv",
    "kvcbj",
    "hfjhj",
    "cvocp",
    "hplfp",
    "kjuup",
    "cfzpo",
    "upvcv",
    "gfbsj",
    "izvnv",
    "cbokp",
    "sjfkv",
    "ijnbo",
    "btpcv",
    "{fvtv",
    "tijhp",
    "vlbup",
    "kjpsv",
    "ufonf",
    "cbocv",
    "ofoib",
    "njepv",
    "lplbo",
    "sbdij",
    "kvcbo",
    "sfhff",
    "nfjsp",
    "sbqqb",
    "cpjtv",
    "ubtiv",
    "{vuup",
    "uboeb",
    "pzbkj",
    "blbov",
    "pnjlj",
    "opvnv",
    "qbubo",
    "bpjbp",
    "nbupv",
    "ebjxb",
    "tpnbo",
    "nfdib",
    "ubjip",
    "buupv",
    "hzphj",
    "iblbp",
    "{pvtb",
    "njutv",
    "plvsv",
    "ibtbj",
    "sjbsv",
    "upjlj",
    "jolfo",
    "nfotv",
    "zpvnb",
    "ijllj",
    "eboob",
    "cvolb",
    "ipvhf",
    "cfo{b",
    "ifeeb",
    "efzvp",
    "obutv",
    "sjqqj",
    "tflzp",
    "bupoj",
    "ojhbp",
    "tvfsv",
    "vubhf",
    "nzv{v",
    "utvlj",
    "tfoep",
    "jsblv",
    "cvtip",
    "tivpo",
    "lzpkj",
    "ubjjo",
    "ububo",
    "fjipv",
    "vzplv",
    "lbefo",
    "cvolp",
    "pobhp",
    "pzphj",
    "spufo",
    "sfkjf",
    "lpflj",
    "bnjep",
    "{vjkj",
    "lb{bj",
    "uptpv",
    "lpkpv",
    "ufjlb",
    "hjnbo",
    "pvipv",
    "lzphp",
    "lbnbf",
    "ubkpv",
    "gvsjo",
    "epsfj",
    "ubcvo",
    "lbibo",
    "ubonb",
    "kvhfo",
    "blvup",
    "fhbsb",
    "bupnf",
    "bxbtf",
    "eblbj",
    "ppcbo",
    "tvtij",
    "eboej",
    "hjlbj",
    "zvohv",
    "iptfj",
    "jublv",
    "gvnjo",
    "blb{v",
    "diblj",
    "lbjhj",
    "cvsfo",
    "zbepo",
    "ovsjf",
    "tivgv",
    "ubjhv",
    "pnpup",
    "fgvef",
    "xbolp",
    "ijlbo",
    "hvdij",
    "szpvj",
    "jokvo",
    "tblfj",
    "jhbub",
    "lbokv",
    "efocb",
    "bolfo",
    "jotpv",
    "gvjoj",
    "fcjtv",
    "gvibo",
    "ibotv",
    "qvsbv",
    "pkbnb",
    "nbjsb",
    "ofsbj",
    "tvqbo",
    "lpzpv",
    "zvjnf",
    "tfo{p",
    "plvsf",
    "lbcvo",
    "pojpo",
    "ubolv",
    "jlvsv",
    "ufplf",
    "pvtij",
    "bjspo",
    "psjkp",
    "jpolb",
    "tbcpv",
    "psjnf",
    "fosfo",
    "pifzb",
    "ojqqb",
    "gvibj",
    "ufjpo",
    "dijzp",
    "cpotp",
    "lp{vf",
    "pibjp",
    "uflfo",
    "bljnb",
    "tpupj",
    "kjzpv",
    "hjtpv",
    "zpvcj",
    "bhblj",
    "svoep",
    "ibspo",
    "lpokj",
    "pvcbj",
    "ebokp",
    "tblbf",
    "sbohf",
    "folpo",
    "vodij",
    "lbtib",
    "tijeb",
    "objlj",
    "hjtij",
    "ufpop",
    "eftij",
    "lfcjo",
    "fj{pv",
    "ufefo",
    "ifjlf",
    "pxbtv",
    "nvtvv",
    "spcjj",
    "pvifj",
    "tpblv",
    "tvufj",
    "sjcfo",
    "sfjpo",
    "bcblv",
    "tvoob",
    "folfj",
    "lvllj",
    "sbolb",
    "ibtij",
    "pvzpv",
    "opllb",
    "votfj",
    "sbolv",
    "jfibf",
    "bpupv",
    "nvvib",
    "ljsjo",
    "qvuup",
    "lfjxb",
    "ufkpv",
    "tpuuf",
    "ijlvj",
    "lboep",
    "kvojb",
    "lpszp",
    "ifcjj",
    "lvibj",
    "bjlpv",
    "nf{po",
    "ojcfo",
    "ijttv",
    "lbjib",
    "vnbzb",
    "tpepv",
    "ubjhp",
    "tfjbv",
    "oboup",
    "hfooj",
    "uptij",
    "cjeep",
    "lbjob",
    "tbutv",
    "efllb",
    "cbolb",
    "szvvj",
    "jnjep",
    "peptv",
    "zpvtp",
    "ijkvv",
    "josbo",
    "fonbj",
    "nvlbv",
    "kpvbj",
    "jolbo",
    "ibjgb",
    "ljfub",
    "njsfj",
    "dijnj",
    "tpvgv",
    "ijptv",
    "kpnfo",
    "ipvqv",
    "ejsbo",
    "tfjup",
    "tfjlj",
    "zpcbv",
    "nfjhp",
    "jtvub",
    "tivhb",
    "kpebj",
    "vtbhj",
    "hbjzb",
    "ppjub",
    "cvoqv",
    "gvipv",
    "kvnpo",
    "npuuf",
    "nbupj",
    "zvvnf",
    "zvlzb",
    "lfonf",
    "ppjoj",
    "nfuup",
    "p{blv",
    "sjlbj",
    "lzphj",
    "ifcpo",
    "tfolf",
    "hjnfj",
    "tfcjo",
    "hjoxb",
    "ufblj",
    "fjtbj",
    "flvtv",
    "tbjcv",
    "fuupv",
    "zvvjo",
    "{voup",
    "lpvxb",
    "iblbj",
    "bsjlb",
    "ibuup",
    "bnfij",
    "ipopp",
    "tblbj",
    "uflbo",
    "lpqqj",
    "upebf",
    "hbspv",
    "lpvnf",
    "lbspv",
    "up{bj",
    "kplzp",
    "optij",
    "ebdib",
    "epupv",
    "gv{fo",
    "qfqqb",
    "ptpgv",
    "eplbo",
    "tiblv",
    "zvvcj",
    "nvzpv",
    "sjohb",
    "ifonv",
    "foufj",
    "svqjb",
    "sbjtv",
    "epvtf",
    "zvtfj",
    "nbbkj",
    "xbtij",
    "pibsb",
    "pobcf",
    "fjdij",
    "ljnpo",
    "ojoqv",
    "kptpv",
    "ljoxb",
    "tbkjo",
    "kjlbo",
    "tibkj",
    "cvhfo",
    "vnblv",
    "upocp",
    "ovcjb",
    "zpvkp",
    "ljlvj",
    "ljocv",
    "ljtvv",
    "wfoeb",
    "ljfsv",
    "{vnfo",
    "tvlfj",
    "xbtfj",
    "tipup",
    "vfjwv",
    "jhbsv",
    "kbnbo",
    "hbllb",
    "hptfj",
    "xblbj",
    "nbojb",
    "zvobj",
    "qjfsp",
    "hpkvo",
    "cboep",
    "ljipo",
    "njlbo",
    "hfspv",
    "hpsbo",
    "xbsvj",
    "epspv",
    "pnblf",
    "ovjnf",
    "utvsv",
    "tfsfo",
    "spupv",
    "btvnj",
    "tpvbo",
    "ljolp",
    "lbvsv",
    "dij{v",
    "fsjbo",
    "ebjtv",
    "jlbsj",
    "pnptb",
    "ljolb",
    "lbubo",
    "kpvfo",
    "bkjep",
    "ibjlb",
    "lbsvb",
    "hvbop",
    "qpeep",
    "kpcvo",
    "cbszv",
    "pijsv",
    "ubjnb",
    "tijzp",
    "lpjnf",
    "ijjpo",
    "jfkvv",
    "sbjob",
    "ijtvj",
    "gvcvo",
    "tpuup",
    "sjspo",
    "focbo",
    "nfotp",
    "fjtpo",
    "ebzbo",
    "qjbsj",
    "lbsfo",
    "{fojo",
    "kjotb",
    "boobj",
    "njsvo",
    "ipv{v",
    "jzblf",
    "iboub",
    "vnjcf",
    "v{vsb",
    "uposf",
    "tivsb",
    "qpb{v",
    "jlboj",
    "sjzvv",
    "tbopv",
    "cfo{v",
    "gphhv",
    "ojsvj",
    "upozb",
    "ufohj",
    "tijib",
    "v{vlv",
    "kvzpv",
    "b{vtb",
    "kvfsj",
    "jfljo",
    "zpipv",
    "cjgvv",
    "uboqp",
    "vtvsj",
    "dibub",
    "spifo",
    "gvifo",
    "tfjzv",
    "sjotv",
    "lpsjo",
    "ipzvv",
    "cbhhv",
    "tfjjo",
    "ibjnf",
    "ijoep",
    "qzvsf",
    "nbhbj",
    "{fjlb",
    "tfebo",
    "spvlv",
    "upjsf",
    "lptij",
    "tvjep",
    "tipnv",
    "blbbj",
    "hjcpo",
    "npzpv",
    "hvlpv",
    "{bjsj",
    "ojhpv",
    "ptblj",
    "tijpo",
    "lbjlv",
    "opllv",
    "kjtbo",
    "vnjoj",
    "cbjlb",
    "hpibo",
    "vofsj",
    "qfspo",
    "qbohb",
    "jtvsv",
    "ibqbo",
    "lfjlp",
    "cbjfo",
    "vopnj",
    "tvlvj",
    "ibjib",
    "gvifj",
    "ubtbo",
    "cbohb",
    "bszvv",
    "sjuub",
    "cboqv",
    "cbjzb",
    "lvsbo",
    "ibutv"
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
    shareText: "\u65E5\u672C\u8A9E\u306EWordle\uFF08\u30ED\u30DE\u30B8\uFF09\n#{day}\n {guesses}/6\nhttps://wordle-jp.netlify.app/\n"
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
