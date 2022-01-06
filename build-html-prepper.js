const fs = require("fs");
const path = require("path");
const md5 = require('md5')

async function getHash(fn) {
  let content = await fs.promises.readFile(fn, "utf8");
  return md5(content);
}

exports = (options = {}) => {
  return {
    name: 'prepper',
    setup(build) {
      build.onEnd(async result => {
        let indexHtml = await fs.promises.readFile("index.html", "utf8");
        if (options.prod) {
          let appJsHash = await getHash("public/app.js");
          let appCssHash = await getHash("public/app.css");
          indexHtml = indexHtml.replace("./app.js", "./app." + appJsHash + ".js");
          indexHtml = indexHtml.replace("./app.css", "./app." + appCssHash + ".css");
          indexHtml = indexHtml.replace(/<!--LiveReload-->.*<!--LiveReload-->/is, "");
        }
        await fs.promises.writeFile("public/index.html", indexHtml);
      });
    }
  };
}
module.exports = exports;
