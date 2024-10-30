import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { rollup } from 'rollup';
import { createLogger } from 'vite';

let esbuildPlugin;
let set;
const PLUGIN_NAME = "solid-typed-routes";
const logger = createLogger("info", { prefix: `[${PLUGIN_NAME}]`, allowClearScreen: true });
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
  resolvedOptions.outputPath = path.isAbsolute(resolvedOptions.outputPath) ? resolvedOptions.outputPath : path.resolve(resolvedOptions.root, resolvedOptions.outputPath);
  return resolvedOptions;
};
function defineRoutes(fileRoutes) {
  function processRoute(routes, route, id, full) {
    const parentRoute = Object.values(routes).find((o) => {
      return id.startsWith(o.info.id + "/");
    });
    if (!parentRoute) {
      routes.push(route);
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
const outputFileTemplatePath = path.resolve(
  import.meta.dirname,
  "..",
  "static",
  "outputFileTemplate.ts"
);
let outputFileTemplate = fs.readFileSync(outputFileTemplatePath, "utf-8");
let isRunning = false;
const generateTypedRoutes = async (resolvedOptions_) => {
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
      return Object.entries(resolvedOptions.replacements).sort((a, b) => {
        return b[1].length - a[1].length;
      }).reduce((acc, [key, value]) => {
        return acc.split(key).join(value);
      }, string);
    };
    const { routesPath, outputPath } = resolvedOptions;
    let routesDefinitions = resolvedOptions.routesDefinitions;
    if (!fs.existsSync(routesPath) || !fs.lstatSync(routesPath).isDirectory()) {
      throwError(`Routes directory not found at ${routesPath}`);
    }
    const searchParamsImports = [];
    const routesObject = {};
    if (routesDefinitions.length <= 0) {
      try {
        const validPathRegex = /^(\w|\d|_|\-|\.|\\|\/|\[|\]|\(|\))+$/g;
        const routesFilesPaths = fs.readdirSync(routesPath, { recursive: true }).reduce((acc, routePath_) => {
          const routePath = routePath_.toString();
          const absolutePath = path.resolve(routesPath, routePath);
          if (fs.lstatSync(absolutePath).isDirectory()) return acc;
          if (!routePath.match(validPathRegex)?.[0]) {
            throwError(
              `Invalid route path "${routePath}". Routes must conform to the regex ${validPathRegex}`
            );
          } else {
          }
          acc.push(absolutePath);
          return acc;
        }, []);
        esbuildPlugin = esbuildPlugin || (await import('rollup-plugin-esbuild')).default;
        const build = await rollup({
          input: routesFilesPaths,
          logLevel: "silent",
          plugins: [esbuildPlugin({ target: "esnext", logLevel: "silent" })]
        });
        const generated = await build.generate({});
        const output = generated.output;
        for (let i = 0; i < output.length; i++) {
          const file = output[i];
          if (file.facadeModuleId) {
            const relativePath = path.relative(routesPath, file.facadeModuleId).replace(/\\/g, "/");
            const isRoute = !relativePath.startsWith("..");
            if (isRoute) {
              const ext = path.extname(relativePath);
              let routePath = relativePath.replace(new RegExp(`\\${ext}$`), "").replace(/\[\.{3}/g, "*").replace(/\[([^\]]+)\]/g, ":$1").replace(/\]/g, "").replace(/\\/g, "/").replace(/\/?\(.+\)/g, "").replace(/^index$/g, "/").replace(/index$/g, "");
              routePath = routePath ? routePath.startsWith("/") ? routePath : `/${routePath}` : routePath;
              let relativePathFromOutput = path.relative(
                path.dirname(resolvedOptions.outputPath),
                path.join(resolvedOptions.routesPath, relativePath)
              ).replace(/\\/g, "/");
              if (!relativePathFromOutput.startsWith(".")) {
                relativePathFromOutput = "./" + relativePathFromOutput;
              }
              const isRoute2 = relativePathFromOutput.endsWith(".tsx");
              if (isRoute2) {
                set = set || (await import('lodash-es/set')).default;
                set(
                  routesObject,
                  [...routePath.split("/").filter(Boolean).map(useReplacements), "route"],
                  routePath || "/"
                );
                routesDefinitions.push({
                  path: routePath,
                  component: `$$$lazy(() => import('${relativePathFromOutput.replace(new RegExp(`\\${ext}$`), "")}'))$$$`,
                  info: {
                    id: relativePath.replace(new RegExp(`\\${ext}$`), "")
                  }
                });
                if (file.exports.includes("searchParams")) {
                  const asName = `searchParams${searchParamsImports.length}`;
                  searchParamsImports.push(
                    `import type { searchParams as ${asName} } from "${relativePathFromOutput}"`
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
    }
    const routes = JSON.stringify(defineRoutes(routesDefinitions), null, 2).replace(/('|"|`)?\${3}('|"|`)?/g, "").replace(/"([^"]+)":/g, "$1:").replace(/\uFFFF/g, '\\"');
    const routesMap = JSON.stringify(routesObject, null, 2).replace(/"([^"]+)":/g, "$1:").replace(/\uFFFF/g, '\\"');
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
            const parsedParam = useReplacements(param);
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
    if (process.env.PLUGIN_DEV) {
      outputFileTemplate = fs.readFileSync(outputFileTemplatePath, "utf-8");
    }
    const createOutputFile = (values) => {
      let outputFile2 = "";
      const banner = [
        "// IMPORTANT: This file is auto-generated by Solid Typed Routes. Do not edit it directly, it will be overwritten.",
        ""
        // '/* prettier-ignore-start */',
        // '',
        // '/* eslint-disable */',
        // '',
        // '// @ts-nocheck',
        // '',
        // '// noinspection JSUnusedGlobalSymbols',
        // '',
      ].join("\n");
      outputFile2 += banner;
      outputFile2 += "\n";
      outputFile2 += searchParamsImports.join("\n");
      outputFile2 += "\n";
      const body = Object.entries(values).reduce((acc, [key, value]) => {
        const replacement = (typeof value !== "string" ? JSON.stringify(value, null, 2) : value) ?? "''";
        return acc.split(`$$$${key}$$$`).join(replacement);
      }, outputFileTemplate);
      outputFile2 += body;
      outputFile2 = outputFile2.replaceAll("// @ts-ignore", "");
      return outputFile2;
    };
    const outputFile = createOutputFile({
      ...resolvedOptions,
      routes,
      routesMap,
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
  }
  isRunning = false;
};
const pluginFilesDir = path.resolve(import.meta.dirname, "..");
const solidTypedRoutesPlugin = (options = DEFAULTS) => {
  const pluginDev = !!process.env.PLUGIN_DEV;
  pluginDev && logger.error("Development mode", { timestamp: true });
  const resolvedOptions = resolveOptions(options);
  generateTypedRoutes(resolvedOptions);
  return {
    name: "solid-typed-routes",
    enforce: "post",
    buildStart() {
      pluginDev && this.addWatchFile(pluginFilesDir);
      generateTypedRoutes(resolvedOptions);
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

export { solidTypedRoutesPlugin };
