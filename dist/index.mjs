import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const DEFAULTS = {
  root: process.cwd(),
  routesPath: "src/routes",
  outputPath: "src/typedRoutes.gen.ts",
  routesDefinitions: [],
  dynamicParamsPrefix: "$",
  dynamicCatchAllParamsPrefix: "$$",
  dotReplacement: "_dot_",
  dashReplacement: "_dash_",
  plusReplacement: "_plus_",
  replacements: {
    ":": "$",
    "*": "$$",
    ".": "_dot_",
    "-": "_dash_",
    "+": "_plus_"
  }
};
const resolveOptions = (options) => {
  const resolvedOptions = Object.assign({}, DEFAULTS, options);
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
  import.meta.dirname,
  "..",
  "static",
  "outputFileTemplate.ts"
);
let isRunning = false;
const generateTypedRoutes = async (resolvedOptions) => {
  try {
    if (isRunning) {
      return console.log("typed-routes is already running");
    }
    isRunning = true;
    const { root, routesPath, outputPath } = resolvedOptions;
    let routesDefinitions = resolvedOptions.routesDefinitions;
    if (!fs.existsSync(routesPath) || !fs.lstatSync(routesPath).isDirectory()) {
      throw new Error(`Routes directory not found at ${routesPath}`);
    }
    if (routesDefinitions.length <= 0) {
      try {
        let SolidStartServerFileRouter;
        let routesPluginInit;
        try {
          const require = createRequire(root);
          const solidStartConfigPath = path.dirname(require.resolve("@solidjs/start/config"));
          const fileSysteRouterPath = pathToFileURL(
            path.resolve(solidStartConfigPath, "fs-router.js")
          ).pathname;
          SolidStartServerFileRouter = (await import(fileSysteRouterPath)).SolidStartServerFileRouter;
          const nodeModulesPath = solidStartConfigPath.split("node_modules")[0] + "node_modules";
          const vinxiPath = path.resolve(nodeModulesPath, "vinxi");
          const routesPluginPath = pathToFileURL(
            path.resolve(vinxiPath, "lib/plugins/routes.js")
          ).pathname;
          routesPluginInit = (await import(routesPluginPath)).routes;
        } catch {
          const nodeModulesPath = findNodeModules(root) || root;
          const fileSysteRouterPath = pathToFileURL(
            path.resolve(nodeModulesPath, "@solidjs/start/config/fs-router.js")
          ).pathname;
          SolidStartServerFileRouter = (await import(fileSysteRouterPath)).SolidStartServerFileRouter;
          const routesPluginPath = pathToFileURL(
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
        console.error(error);
        routesDefinitions = [];
      }
    }
    const routes = JSON.stringify(defineRoutes(routesDefinitions), null, 2).replace(/('|"|`)?\${3}('|"|`)?/g, "").replace(/"([^"]+)":/g, "$1:").replace(/\uFFFF/g, '\\"');
    const { StaticTypedRoutes, DynamicTypedRoutes, DynamicTypedRoutesParams } = routesDefinitions.reduce(
      (acc, route) => {
        if (!route.path)
          return acc;
        const StaticOrDynamic = route.path.includes(":") || route.path.includes("*") ? "DynamicTypedRoutes" : "StaticTypedRoutes";
        acc[StaticOrDynamic] = acc[StaticOrDynamic] ? acc[StaticOrDynamic] + " | " : acc[StaticOrDynamic];
        acc[StaticOrDynamic] += `'${route.path}'`;
        if (StaticOrDynamic === "DynamicTypedRoutes") {
          acc.DynamicTypedRoutesParams[route.path] = acc.DynamicTypedRoutesParams[route.path] || [];
          const params = route.path.match(/(:|\*)([^/]+)/g) || [];
          for (let i = 0; i < params.length; i++) {
            const param = params[i];
            acc.DynamicTypedRoutesParams[route.path].push(
              // camelcase(
              //   param
              //     .split(':')
              //     .join(resolvedOptions.dynamicParamsPrefix)
              //     .split('*')
              //     .join(resolvedOptions.dynamicCatchAllParamsPrefix),
              // ),
              param.split(":").join(resolvedOptions.dynamicParamsPrefix).split("*").join(resolvedOptions.dynamicCatchAllParamsPrefix).split(".").join(resolvedOptions.dotReplacement).split("-").join(resolvedOptions.dashReplacement).split("+").join(resolvedOptions.plusReplacement)
            );
          }
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
      return Object.entries(values).reduce((acc, [key, value]) => {
        return acc.split(`$$$${key}$$$`).join(typeof value !== "string" ? JSON.stringify(value, null, 2) : value);
      }, outputFileTemplate);
    };
    const outputFile = createOutputFile({
      ...resolvedOptions,
      routes,
      StaticTypedRoutes,
      DynamicTypedRoutes,
      DynamicTypedRoutesParams
    });
    fs.writeFileSync(outputPath, outputFile);
  } catch (error) {
    isRunning = false;
    if (error instanceof Error) {
      throw error;
    }
  } finally {
    isRunning = false;
  }
};
const pluginFilesDir = path.resolve(import.meta.dirname, "..");
const solidTypedRoutesPlugin = (options = DEFAULTS) => {
  const pluginDev = !!process.env.PLUGIN_DEV;
  pluginDev && console.log("Development mode of the plugin");
  const resolvedOptions = resolveOptions(options);
  generateTypedRoutes(resolvedOptions);
  return {
    name: "solid-typed-routes",
    api: "serve",
    buildStart() {
      console.log("buildStart");
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

export { solidTypedRoutesPlugin };
