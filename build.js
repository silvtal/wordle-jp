const esbuild = require('esbuild');
const livereload = require("livereload");
const { lessLoader } = require("esbuild-plugin-less");
const customTasks = require("./build-custom-tasks");
const StaticServer = require('static-server');

// FUNCIÓN PARA PARSEAR ARGUMENTOS (sin cambios)
const args = (argList => {
  let res = {};
  let opt, thisOpt, curOpt;
  for (let i = 0; i < argList.length; i++) {
    thisOpt = argList[i].trim();
    opt = thisOpt.replace(/^\-+/, '');
    if (opt === thisOpt) {
      if (curOpt) res[curOpt] = opt;
      curOpt = null;
    }
    else {
      curOpt = opt;
      res[curOpt] = true;
    }
  }
  return res;
})(process.argv);

// DEFINICIÓN DE MODOS
let prod = args.prod ? true : false;
const isWatchMode = args.watch ? true : false;

// CONFIGURACIÓN BASE DE ESBUILD
const buildConfig = {
  entryPoints: ["src/app.js", "src/app.less"],
  outdir: "public",
  bundle: true,
  sourcemap: !prod,
  minify: prod,
  plugins: [
    customTasks({prod}),
    lessLoader(),
  ],
};

if (isWatchMode) {
    // 1. MODO WATCH: Usamos esbuild.context() para un proceso persistente
    esbuild.context(buildConfig).then(ctx => {
        // 2. INICIA EL SERVIDOR Y LIVERELOAD
        livereload.createServer().watch("./public");
        console.log("Watching changes, with livereload...");
        
        const server = new StaticServer({
            rootPath: './public',
            port: 8080,
        });
        
        server.start(function () {
            console.log('Server listening at ' + server.port);
        });

        // 3. INICIA EL WATCHER DE ESBUILD
        // Los errores de reconstrucción se manejarán automáticamente por esbuild
        return ctx.watch(); 
    }).catch(err => {
        console.error("Unexpected error in watch mode; quitting.");
        if (err) console.error(err);
        process.exit(1);
    });
} else {
    // 4. MODO BUILD: Usamos esbuild.build() para una construcción única (Netlify)
    esbuild.build(buildConfig).catch(err => {
        console.error("Unexpected error; quitting.");
        if (err) console.error(err);
        process.exit(1);
    }).then(() => {
        console.log("Build finished.");
    });
}
