'use strict';

var fs = require('node:fs');
var node_module = require('node:module');
var path = require('node:path');
var process = require('node:process');
var url = require('node:url');
var set = require('lodash-es/set.js');
var rollup = require('rollup');
var vite = require('vite');

var _documentCurrentScript = typeof document !== 'undefined' ? document.currentScript : null;
const dirname = undefined || path.dirname(url.fileURLToPath((typeof document === 'undefined' ? require('u' + 'rl').pathToFileURL(__filename).href : (_documentCurrentScript && _documentCurrentScript.tagName.toUpperCase() === 'SCRIPT' && _documentCurrentScript.src || new URL('index.cjs', document.baseURI).href))));
const require$1 = node_module.createRequire((typeof document === 'undefined' ? require('u' + 'rl').pathToFileURL(__filename).href : (_documentCurrentScript && _documentCurrentScript.tagName.toUpperCase() === 'SCRIPT' && _documentCurrentScript.src || new URL('index.cjs', document.baseURI).href)));
const packageJSON = require$1("../package.json");
const PLUGIN_NAME = packageJSON.name;
const esbuildPluginImport = import('rollup-plugin-esbuild');
let esbuildPlugin;
const logger = vite.createLogger("info", { prefix: `[${PLUGIN_NAME}]`, allowClearScreen: true });
const DEFAULTS = {
  root: process.cwd(),
  routesPath: "src/routes",
  typedRouterPath: "src/typedRouter.gen.ts",
  typedSearchParamsPath: "src/typedSearchParams.gen.ts",
  routesDefinitions: [],
  searchParamsSchemas: {},
  replacements: {
    ":": "",
    "*": "",
    ".": "",
    "-": "",
    "+": ""
  }
};
const resolveOptions = (options) => {
  const copiedOptions = structuredClone(options);
  const replacements = Object.assign(
    {},
    DEFAULTS.replacements,
    copiedOptions.replacements
  );
  const resolvedOptions = Object.assign({}, DEFAULTS, copiedOptions, {
    replacements
  });
  resolvedOptions.root = path.isAbsolute(resolvedOptions.root) ? resolvedOptions.root : path.resolve(process.cwd(), resolvedOptions.root);
  resolvedOptions.routesPath = path.isAbsolute(resolvedOptions.routesPath) ? resolvedOptions.routesPath : path.resolve(resolvedOptions.root, resolvedOptions.routesPath);
  resolvedOptions.typedRouterPath = path.isAbsolute(resolvedOptions.typedRouterPath) ? resolvedOptions.typedRouterPath : path.resolve(resolvedOptions.root, resolvedOptions.typedRouterPath);
  return resolvedOptions;
};
function defineRoutes(fileRoutes) {
  function processRoute(routes, route, id, full) {
    route.info.id = id;
    route.info.fullPath = full;
    const parentRoute = Object.values(routes).find((o) => {
      return id.startsWith(o.info.id + "/");
    });
    if (!parentRoute) {
      if (route.component) {
        route.path = route.path.replace(/\/\([^)/]+\)/g, "").replace(/\([^)/]+\)/g, "");
        routes.push(route);
      }
      return routes;
    }
    route.path = route.path.replace(new RegExp(`^${parentRoute.path}`), "");
    processRoute(
      parentRoute.children || (parentRoute.children = []),
      route,
      id.slice(parentRoute.info.id.length),
      full
    );
    return routes;
  }
  return fileRoutes.sort((a, b) => a.path.length - b.path.length).reduce((prevRoutes, route) => {
    route.info = route.info || {};
    route.info.id = route.info.id || route.path;
    return processRoute(prevRoutes, route, route.info.id, route.path);
  }, []);
}
const typedRoutesTemplatePath = path.resolve(dirname, "..", "static", "typedRouter.template.ts");
let typedRoutesTemplate = fs.readFileSync(typedRoutesTemplatePath, "utf-8");
const typedSearchParamsTemplatePath = path.resolve(
  dirname,
  "..",
  "static",
  "typedSearchParams.template.ts"
);
let typedSearchParamsTemplate = fs.readFileSync(typedSearchParamsTemplatePath, "utf-8");
let isRunning = false;
const generateTypedRoutes = async (resolvedOptions_) => {
  esbuildPlugin = esbuildPlugin || (await esbuildPluginImport).default;
  const start = performance.now();
  try {
    const resolvedOptions = structuredClone(resolvedOptions_);
    if (isRunning) {
      return logger.warn(`${PLUGIN_NAME} is already running`, { timestamp: true });
    } else {
      isRunning = true;
    }
    const throwError = (message) => {
      throw new Error(message);
    };
    const useReplacements = (string) => {
      return string.split(/\*|:/g).join("");
    };
    const { routesPath, typedRouterPath } = resolvedOptions;
    let routesDefinitions = resolvedOptions.routesDefinitions;
    const hadSearchParamSchemas = Object.keys(resolvedOptions.searchParamsSchemas).length > 0;
    if (!fs.existsSync(routesPath) || !fs.lstatSync(routesPath).isDirectory()) {
      throwError(`Routes directory not found at ${routesPath}`);
    }
    const searchParamsImportsArray = [];
    const searchParamsExportsArray = [];
    const routesObject = {};
    if (routesDefinitions.length <= 0) {
      try {
        const validPathRegex = /^(\w|\d|_|\-|\.|\\|\/|\[|\]|\(|\))+$/g;
        const routesFilesPaths = fs.readdirSync(routesPath, { recursive: true, encoding: "utf-8" }).reduce((acc, routePath) => {
          const absolutePath = path.resolve(routesPath, routePath);
          if (fs.lstatSync(absolutePath).isDirectory()) return acc;
          if (!routePath.match(validPathRegex)?.[0]) {
            throwError(
              `Invalid route path "${routePath}". Routes must conform to the regex ${validPathRegex}`
            );
          }
          acc.push(absolutePath);
          return acc;
        }, []);
        const build = await rollup.rollup({
          input: routesFilesPaths,
          logLevel: "silent",
          plugins: [esbuildPlugin({ target: "esnext", logLevel: "silent" })]
        });
        const generated = await build.generate({});
        const output = generated.output.sort((a, b) => {
          return a.facadeModuleId.length - b.facadeModuleId.length;
        });
        let foundRoot = false;
        for (let i = 0; i < output.length; i++) {
          const file = output[i];
          if (file.facadeModuleId) {
            const relativePath = path.relative(routesPath, file.facadeModuleId).replace(/\\/g, "/");
            const isRoute = !relativePath.startsWith("..");
            if (isRoute) {
              const ext = path.extname(relativePath);
              const extRegex = new RegExp(`\\${ext}$`);
              let routePath = relativePath.replace(extRegex, "").replace(/index$/, "").replace(/\[([^\/]+)\]/g, (_, m) => {
                if (m.length > 3 && m.startsWith("...")) {
                  return `*${m.slice(3)}`;
                }
                if (m.length > 2 && m.startsWith("[") && m.endsWith("]")) {
                  return `:${m.slice(1, -1)}?`;
                }
                return `:${m}`;
              }).replace(/\/\([^)/]+\)/g, "").replace(/\([^)/]+\)/g, "");
              let relativePathFromTypedRouter = path.relative(
                path.dirname(resolvedOptions.typedRouterPath),
                path.join(resolvedOptions.routesPath, relativePath)
              ).replace(/\\/g, "/");
              if (!relativePathFromTypedRouter.startsWith(".")) {
                relativePathFromTypedRouter = "./" + relativePathFromTypedRouter;
              }
              const isValidRoute = relativePathFromTypedRouter.match(/\.ts(x)?$/g);
              if (isValidRoute) {
                const routeParts = routePath.split("/").filter(Boolean);
                const routePartsReplaced = routeParts.map(useReplacements).filter(Boolean);
                const routePartsReplacedWithRoute = [...routePartsReplaced, "route"];
                routePath = routeParts.join("/");
                if (!routePath && !foundRoot) {
                  foundRoot = true;
                  routePath = "/";
                }
                if (routePath) {
                  routePath = routePath.startsWith("/") ? routePath : `/${routePath}`;
                  if (routePath === "/" || !routePath.endsWith("/")) {
                    set(routesObject, routePartsReplacedWithRoute, routePath);
                  }
                }
                const hasDefaultExport = file.exports.includes("default");
                const endpoints = file.exports.filter((export_) => {
                  return ["GET", "POST", "PUT", "PATCH", "DELETE"].includes(export_);
                });
                routesDefinitions.push({
                  path: routePath,
                  component: hasDefaultExport ? `$$$lazy(() => import('${relativePathFromTypedRouter.replace(extRegex, "")}'))$$$` : "",
                  info: {
                    id: "/" + relativePath.replace(extRegex, ""),
                    filesystem: true,
                    endpoints
                  }
                });
                if (file.exports.includes("searchParams") && !resolvedOptions.searchParamsSchemas[routePath]) {
                  const asName = `searchParams${searchParamsImportsArray.length}`;
                  searchParamsImportsArray.push(
                    `import type { searchParams as ${asName} } from "${relativePathFromTypedRouter}"`
                  );
                  let relativePathFromTypedSearchParams = path.relative(
                    path.dirname(resolvedOptions.typedSearchParamsPath),
                    path.join(resolvedOptions.routesPath, relativePath)
                  ).replace(/\\/g, "/");
                  if (!relativePathFromTypedSearchParams.startsWith(".")) {
                    relativePathFromTypedSearchParams = "./" + relativePathFromTypedSearchParams;
                  }
                  searchParamsExportsArray.push(
                    `export { searchParams as ${asName} } from "${relativePathFromTypedSearchParams}"`
                  );
                  resolvedOptions.searchParamsSchemas[routePath] = `{} as typeof ${asName}`;
                }
              }
            }
          }
        }
      } catch (error) {
        logger.error(error, { timestamp: true });
        routesDefinitions = [];
      }
    } else {
      const newRoutesDefinitions = routesDefinitions.map((route) => {
        const componentPath = path.resolve(resolvedOptions.root, route.component);
        route.component = `$$$lazy(() => import('${componentPath}'))$$$`;
        return route;
      });
      routesDefinitions.length = 0;
      routesDefinitions.push(...newRoutesDefinitions);
    }
    const { StaticTypedRoutes, DynamicTypedRoutes, DynamicTypedRoutesParams } = routesDefinitions.reduce(
      (acc, route) => {
        const routePath = route.path;
        if (!routePath || routePath !== "/" && routePath.endsWith("/")) {
          return acc;
        }
        const StaticOrDynamic = routePath.includes(":") || routePath.includes("*") ? "DynamicTypedRoutes" : "StaticTypedRoutes";
        acc[StaticOrDynamic] = acc[StaticOrDynamic].split(" | ").concat(`'${routePath}'`).join(" | ");
        if (StaticOrDynamic === "DynamicTypedRoutes") {
          const routeParams = acc.DynamicTypedRoutesParams[routePath] || [];
          const params = routePath.match(/(:|\*)([^/]+)/g) || [];
          for (let i = 0; i < params.length; i++) {
            const param = params[i];
            const parsedParam = useReplacements(param);
            if (routeParams.includes(parsedParam)) {
              throwError(
                `Duplicate route parameter" ${param}" (parsed: "${parsedParam}") in "${routePath}"`
              );
            }
            routeParams.push(parsedParam);
          }
          acc.DynamicTypedRoutesParams[routePath] = routeParams;
        }
        return acc;
      },
      {
        StaticTypedRoutes: "",
        DynamicTypedRoutes: "",
        DynamicTypedRoutesParams: {}
      }
    );
    const routes = JSON.stringify(defineRoutes(structuredClone(routesDefinitions)), null, 2).replace(/('|"|`)?\${3}('|"|`)?/g, "");
    const routesMap = JSON.stringify(routesObject, null, 2);
    const searchParamsImports = searchParamsImportsArray.join("\n");
    const searchParamsExports = searchParamsExportsArray.join("\n");
    let searchParamsSchemas = JSON.stringify(resolvedOptions.searchParamsSchemas, null, 2);
    searchParamsSchemas = hadSearchParamSchemas ? searchParamsSchemas : (
      // https://stackoverflow.com/a/11233515/10019771
      searchParamsSchemas.replace(/: "([^"]+)"/g, ": $1")
    );
    const SearchParamsRoutes = Object.keys(resolvedOptions.searchParamsSchemas).map((k) => `'${k}'`).join(" | ");
    if (process.env.PLUGIN_DEV) {
      typedRoutesTemplate = fs.readFileSync(typedRoutesTemplatePath, "utf-8");
      typedSearchParamsTemplate = fs.readFileSync(typedSearchParamsTemplatePath, "utf-8");
    }
    const createOutputFile = (template, values) => {
      let outputFile = "";
      const banner = [
        "// IMPORTANT: This file is auto-generated by Solid Typed Routes. Do not edit it directly, it will be overwritten.",
        "",
        "/* prettier-ignore-start */",
        "",
        "/* eslint-disable */",
        "",
        "// @ts-nocheck",
        "",
        "// noinspection JSUnusedGlobalSymbols",
        ""
      ].join("\n");
      outputFile += banner;
      const body = Object.entries(values).reduce((acc, [key, value]) => {
        const replacement = (typeof value !== "string" ? JSON.stringify(value, null, 2) : value) || "''";
        return acc.split(`$$$${key}$$$`).join(replacement);
      }, template);
      outputFile += body;
      outputFile = outputFile.replaceAll("// @ts-ignore", "");
      return outputFile;
    };
    const typedRoutesFile = createOutputFile(typedRoutesTemplate, {
      ...resolvedOptions,
      routes,
      routesMap,
      searchParamsSchemas,
      searchParamsImports,
      SearchParamsRoutes,
      StaticTypedRoutes,
      DynamicTypedRoutes,
      DynamicTypedRoutesParams
    });
    fs.writeFileSync(typedRouterPath, typedRoutesFile);
    const typedSearchParamsFile = createOutputFile(typedSearchParamsTemplate, {
      searchParamsExports
    });
    fs.writeFileSync(resolvedOptions.typedSearchParamsPath, typedSearchParamsFile);
    logger.info(`Typed routes generated in ${Math.round(performance.now() - start)}ms`, {
      timestamp: true
    });
  } catch (error) {
    isRunning = false;
    if (error instanceof Error) {
      throw error;
    }
  }
  isRunning = false;
};
const pluginFilesDir = path.resolve(dirname, "..");
const vinxiCompatConfig = (config) => {
  try {
    const configAsAny = config;
    if (configAsAny?.router?.internals?.routes) {
      const router = configAsAny?.router?.internals?.routes;
      const getRoutes = router?.getRoutes?.bind(router);
      router.getRoutes = async () => {
        const routes = await getRoutes();
        return routes.map((route) => {
          if (route?.$component?.pick && !route?.$component?.pick.includes("searchParams")) {
            route.$component.pick.push("searchParams");
          }
          if (route?.$$route?.pick && !route?.$$route?.pick.includes("searchParams")) {
            route.$$route.pick.push("searchParams");
          }
          return route;
        });
      };
    }
  } catch (error) {
    logger.warn(error);
  }
  config.resolve ??= {};
  config.resolve.alias ??= {};
  config.resolve.alias[PLUGIN_NAME] = PLUGIN_NAME;
  return config;
};
const solidTypedRouterPlugin = (options = DEFAULTS) => {
  const pluginDev = !!process.env.PLUGIN_DEV;
  pluginDev && logger.error("Development mode", { timestamp: true });
  const resolvedOptions = resolveOptions(options);
  return {
    name: PLUGIN_NAME,
    enforce: "pre",
    buildStart() {
      pluginDev && this.addWatchFile(pluginFilesDir);
      generateTypedRoutes(resolvedOptions);
    },
    config(config) {
      return vinxiCompatConfig(config);
    },
    configResolved(config) {
      vinxiCompatConfig(config);
    },
    watchChange(changePath) {
      if (pluginDev) {
        const isPluginFile = ["src", "static"].map((dir) => {
          return path.join(pluginFilesDir, dir).replace(/\\/g, "/");
        }).some((src) => {
          return changePath.startsWith(src);
        });
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

exports.solidTypedRouterPlugin = solidTypedRouterPlugin;
