'use strict';

var fs = require('node:fs');
var node_module = require('node:module');
var path = require('node:path');
var process = require('node:process');
var node_url = require('node:url');
var rollup = require('rollup');
var vite = require('vite');

let esbuild;
const logger = vite.createLogger("info", { prefix: "[solid-typed-routes]", allowClearScreen: true });
const DEFAULTS = {
  root: process.cwd(),
  routesPath: "src/routes",
  outputPath: "src/typedRoutes.gen.ts",
  routesDefinitions: [],
  searchParamsSchemas: {},
  replacements: {
    ":": "$",
    "*": "$$",
    ".": "_dot_",
    "-": "_dash_",
    "+": "_plus_"
  }
};
const resolveOptions = (options) => {
  const replacements = Object.assign(
    {},
    DEFAULTS.replacements,
    options.replacements
  );
  const resolvedOptions = Object.assign({}, DEFAULTS, options, {
    replacements
  });
  resolvedOptions.root = path.isAbsolute(resolvedOptions.root) ? resolvedOptions.root : path.resolve(process.cwd(), resolvedOptions.root);
  resolvedOptions.routesPath = path.isAbsolute(resolvedOptions.routesPath) ? resolvedOptions.routesPath : path.resolve(resolvedOptions.root, resolvedOptions.routesPath);
  resolvedOptions.outputPath = path.isAbsolute(resolvedOptions.outputPath) ? resolvedOptions.outputPath : path.resolve(resolvedOptions.root, resolvedOptions.outputPath);
  return resolvedOptions;
};
function defineRoutes(fileRoutes) {
  function processRoute(routes, route, id, full) {
    const parentRoute = Object.values(routes).find((o) => {
      return id.startsWith(o.info.id + "/");
    });
    if (!parentRoute) {
      routes.push({
        ...route
        // info: { id },
        // path: id.replace(/\/\([^)/]+\)/g, '').replace(/\([^)/]+\)/g, ''),
      });
      return routes;
    }
    processRoute(
      parentRoute.children || (parentRoute.children = []),
      route,
      id.slice(parentRoute.info.id.length));
    return routes;
  }
  return fileRoutes.sort((a, b) => a.path.length - b.path.length).reduce((prevRoutes, route) => {
    route.info = route.info || {};
    route.info.id = route.info.id || route.path;
    return processRoute(prevRoutes, route, route.info.id, route.path);
  }, []);
}
const findNodeModules = (root) => {
  const nodeModulesPath = path.resolve(root, "node_modules");
  if (fs.existsSync(nodeModulesPath)) {
    return nodeModulesPath;
  }
  const parentDir = path.resolve(root, "..");
  if (parentDir === root) {
    return;
  }
  return findNodeModules(parentDir);
};
const outputFileTemplatePath = path.resolve(
  undefined,
  "..",
  "static",
  "outputFileTemplate.ts"
);
let isRunning = false;
const generateTypedRoutes = async (resolvedOptions) => {
  const start = performance.now();
  try {
    if (isRunning) {
      return logger.warn("typed-routes is already running", { timestamp: true });
    }
    const throwError = (message) => {
      throw new Error(message);
    };
    isRunning = true;
    const { root, routesPath, outputPath } = resolvedOptions;
    let routesDefinitions = resolvedOptions.routesDefinitions;
    if (!fs.existsSync(routesPath) || !fs.lstatSync(routesPath).isDirectory()) {
      throwError(`Routes directory not found at ${routesPath}`);
    }
    if (routesDefinitions.length <= 0) {
      try {
        let SolidStartServerFileRouter;
        let routesPluginInit;
        try {
          const require$1 = node_module.createRequire(root);
          const solidStartConfigPath = path.dirname(require$1.resolve("@solidjs/start/config"));
          const fileSysteRouterPath = node_url.pathToFileURL(
            path.resolve(solidStartConfigPath, "fs-router.js")
          ).pathname;
          SolidStartServerFileRouter = (await import(fileSysteRouterPath)).SolidStartServerFileRouter;
          const nodeModulesPath = solidStartConfigPath.split("node_modules")[0] + "node_modules";
          const vinxiPath = path.resolve(nodeModulesPath, "vinxi");
          const routesPluginPath = node_url.pathToFileURL(
            path.resolve(vinxiPath, "lib/plugins/routes.js")
          ).pathname;
          routesPluginInit = (await import(routesPluginPath)).routes;
        } catch {
          const nodeModulesPath = findNodeModules(root) || root;
          const fileSysteRouterPath = node_url.pathToFileURL(
            path.resolve(nodeModulesPath, "@solidjs/start/config/fs-router.js")
          ).pathname;
          SolidStartServerFileRouter = (await import(fileSysteRouterPath)).SolidStartServerFileRouter;
          const routesPluginPath = node_url.pathToFileURL(
            path.resolve(nodeModulesPath, "vinxi/lib/plugins/routes.js")
          ).pathname;
          routesPluginInit = (await import(routesPluginPath)).routes;
        }
        const fileRouter = new SolidStartServerFileRouter(
          {
            dir: routesPath,
            extensions: ["ts", "tsx"]
          },
          {},
          {}
        );
        const routesPlugin = routesPluginInit();
        routesPlugin.configResolved({
          root: routesPath,
          router: {
            target: "server",
            name: "solid",
            internals: {
              routes: fileRouter
            }
          }
        });
        const routesCode = (await routesPlugin.load("vinxi/routes")).replaceAll(`"filePath":"${root}/src/`, '"filePath":"').replace(/"\$[^\}]+/g, "noop").replaceAll("noop},", "").replace(/\.tsx/g, "").replace("export default", "").trim();
        const routes2 = JSON.parse(routesCode);
        routesDefinitions = routes2.reduce((acc, route) => {
          if (!route.page) {
            return acc;
          }
          const relativeFilePath = [
            "./",
            path.relative(path.dirname(outputPath), route.filePath).replace(/\\/g, "/")
          ].join("");
          acc.push({
            path: route.path.replace(/\/\([^)/]+\)/g, "").replace(/\([^)/]+\)/g, ""),
            // use a recongnizable string that can be replaced later
            component: `$$$lazy(() => import('${relativeFilePath}'))$$$`,
            info: {
              id: relativeFilePath
            }
          });
          return acc;
        }, []);
      } catch (error) {
        logger.error(error, { timestamp: true });
        routesDefinitions = [];
      }
    }
    const searchParamsImports = [];
    try {
      esbuild = esbuild || (await import('rollup-plugin-esbuild')).default;
      const build = await rollup.rollup({
        input: routesDefinitions.map(
          (route) => path.join(path.dirname(resolvedOptions.outputPath), route.info.id + ".tsx")
        ),
        logLevel: "silent",
        plugins: [esbuild({ target: "esnext", logLevel: "silent" })]
      });
      const generated = await build.generate({});
      const output = generated.output;
      for (let i = 0; i < output.length; i++) {
        const file = output[i];
        if (!file.facadeModuleId) {
          continue;
        }
        if (file.exports.includes("searchParams")) {
          const route = routesDefinitions.find((route2) => {
            return path.normalize(path.join(path.dirname(resolvedOptions.outputPath), route2.info.id)).replace(".tsx", "") === path.normalize(file.facadeModuleId).replace(".tsx", "");
          });
          const routePath = route?.path;
          if (routePath) {
            const asName = `searchParams${searchParamsImports.length}`;
            searchParamsImports.push(
              `import type { searchParams as ${asName} } from "${route.info.id}"`
            );
            resolvedOptions.searchParamsSchemas[routePath] = `{} as typeof ${asName}`;
          }
        }
      }
    } catch (error) {
      logger.error(error, { timestamp: true });
    }
    const routes = JSON.stringify(defineRoutes(routesDefinitions), null, 2).replace(/('|"|`)?\${3}('|"|`)?/g, "").replace(/"([^"]+)":/g, "$1:").replace(/\uFFFF/g, '\\"');
    const searchParamsSchemas = JSON.stringify(resolvedOptions.searchParamsSchemas, null, 2).replace(/: "([^"]+)"/g, ": $1");
    const SearchParamsRoutes = Object.keys(resolvedOptions.searchParamsSchemas).map((k) => `'${k}'`).join(" | ");
    const { StaticTypedRoutes, DynamicTypedRoutes, DynamicTypedRoutesParams } = routesDefinitions.reduce(
      (acc, route) => {
        if (!route.path) return acc;
        const StaticOrDynamic = route.path.includes(":") || route.path.includes("*") ? "DynamicTypedRoutes" : "StaticTypedRoutes";
        acc[StaticOrDynamic] = acc[StaticOrDynamic] ? acc[StaticOrDynamic] + " | " : acc[StaticOrDynamic];
        acc[StaticOrDynamic] += `'${route.path}'`;
        if (StaticOrDynamic === "DynamicTypedRoutes") {
          const routeParams = acc.DynamicTypedRoutesParams[route.path] || [];
          const params = route.path.match(/(:|\*)([^/]+)/g) || [];
          for (let i = 0; i < params.length; i++) {
            const param = params[i];
            const parsedParam = Object.entries(resolvedOptions.replacements).sort((a, b) => {
              return b[1].length - a[1].length;
            }).reduce((acc2, [key, value]) => {
              return acc2.split(key).join(value);
            }, param);
            if (routeParams.includes(parsedParam)) {
              throwError(
                `Duplicate route parameter" ${param}" (parsed: "${parsedParam}") in "${route.path}"`
              );
            }
            routeParams.push(parsedParam);
          }
          acc.DynamicTypedRoutesParams[route.path] = routeParams;
        }
        return acc;
      },
      {
        StaticTypedRoutes: "",
        DynamicTypedRoutes: "",
        DynamicTypedRoutesParams: {}
      }
    );
    const outputFileTemplate = fs.readFileSync(outputFileTemplatePath, "utf-8");
    const createOutputFile = (values) => {
      let outputFile2 = "";
      outputFile2 += "\n";
      outputFile2 += searchParamsImports.join("\n");
      outputFile2 += "\n";
      const body = Object.entries(values).reduce((acc, [key, value]) => {
        return acc.split(`$$$${key}$$$`).join(typeof value !== "string" ? JSON.stringify(value, null, 2) : value);
      }, outputFileTemplate);
      outputFile2 += body;
      outputFile2 = outputFile2.replaceAll("// @ts-ignore", "");
      return outputFile2;
    };
    const outputFile = createOutputFile({
      ...resolvedOptions,
      routes,
      searchParamsSchemas,
      SearchParamsRoutes,
      StaticTypedRoutes,
      DynamicTypedRoutes,
      DynamicTypedRoutesParams
    });
    fs.writeFileSync(outputPath, outputFile);
    logger.info(`Typed routes generated in ${Math.round(performance.now() - start)}ms`, {
      timestamp: true
    });
  } catch (error) {
    isRunning = false;
    if (error instanceof Error) {
      throw error;
    }
  } finally {
    isRunning = false;
  }
};
const pluginFilesDir = path.resolve(undefined, "..");
const solidTypedRoutesPlugin = (options = DEFAULTS) => {
  const pluginDev = !!process.env.PLUGIN_DEV;
  pluginDev && logger.info("Development mode of the plugin", { timestamp: true });
  const resolvedOptions = resolveOptions(options);
  generateTypedRoutes(resolvedOptions);
  return {
    name: "solid-typed-routes",
    api: "serve",
    buildStart() {
      pluginDev && this.addWatchFile(pluginFilesDir);
      generateTypedRoutes(resolvedOptions);
    },
    // configureServer(server) {
    //   pluginDev && server.watcher.add(pluginFilesDir)
    // },
    watchChange(changePath) {
      if (pluginDev) {
        const pluginRelative = path.relative(pluginFilesDir, changePath);
        const isPluginFile = pluginRelative && !pluginRelative.startsWith("..") && !path.isAbsolute(pluginRelative);
        if (isPluginFile) {
          return generateTypedRoutes(resolvedOptions);
        }
      }
      const relative = path.relative(resolvedOptions.routesPath, changePath);
      const isRoute = relative && !relative.startsWith("..") && !path.isAbsolute(relative);
      if (isRoute) {
        generateTypedRoutes(resolvedOptions);
      }
    }
  };
};

exports.solidTypedRoutesPlugin = solidTypedRoutesPlugin;
