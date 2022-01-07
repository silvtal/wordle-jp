class Warning {
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
}

export {Warning};
