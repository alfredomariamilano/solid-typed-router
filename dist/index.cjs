"use strict";
//#region rolldown:runtime
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));

//#endregion
const node_fs = __toESM(require("node:fs"));
const node_module = __toESM(require("node:module"));
const node_path = __toESM(require("node:path"));
const node_process = __toESM(require("node:process"));
const node_url = __toESM(require("node:url"));
const lodash_es_set_js = __toESM(require("lodash-es/set.js"));
const rolldown = __toESM(require("rolldown"));
const vite = __toESM(require("vite"));

//#region src/vite-plugin.ts
const dirname = __dirname || node_path.default.dirname(node_url.default.fileURLToPath(
	// https://stackoverflow.com/a/11233515/10019771
	require("url").pathToFileURL(__filename).href
));
const require$1 = (0, node_module.createRequire)(require("url").pathToFileURL(__filename).href);
const packageJSON = require$1("../package.json");
const PLUGIN_NAME = packageJSON.name;
const logger = (0, vite.createLogger)("info", {
	prefix: `[${PLUGIN_NAME}]`,
	allowClearScreen: true
});
const DEFAULTS = {
	root: node_process.default.cwd(),
	routesPath: "src/routes",
	typedRouterPath: "src/typedRouter.gen.tsx",
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
	const replacements = Object.assign({}, DEFAULTS.replacements, copiedOptions.replacements);
	const resolvedOptions = Object.assign({}, DEFAULTS, copiedOptions, { replacements });
	resolvedOptions.root = node_path.default.isAbsolute(resolvedOptions.root) ? resolvedOptions.root : node_path.default.resolve(node_process.default.cwd(), resolvedOptions.root);
	resolvedOptions.routesPath = node_path.default.isAbsolute(resolvedOptions.routesPath) ? resolvedOptions.routesPath : node_path.default.resolve(resolvedOptions.root, resolvedOptions.routesPath);
	resolvedOptions.typedRouterPath = node_path.default.isAbsolute(resolvedOptions.typedRouterPath) ? resolvedOptions.typedRouterPath : node_path.default.resolve(resolvedOptions.root, resolvedOptions.typedRouterPath);
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
		processRoute(parentRoute.children || (parentRoute.children = []), route, id.slice(parentRoute.info.id.length), full);
		return routes;
	}
	return fileRoutes.sort((a, b) => a.path.length - b.path.length).reduce((prevRoutes, route) => {
		route.info = route.info || {};
		route.info.id = route.info.id || route.path;
		return processRoute(prevRoutes, route, route.info.id, route.info.id);
	}, []);
}
const typedRoutesTemplatePath = node_path.default.resolve(dirname, "..", "static", "typedRouter.template.tsx");
let typedRoutesTemplate = node_fs.default.readFileSync(typedRoutesTemplatePath, "utf-8");
const typedSearchParamsTemplatePath = node_path.default.resolve(dirname, "..", "static", "typedSearchParams.template.ts");
let typedSearchParamsTemplate = node_fs.default.readFileSync(typedSearchParamsTemplatePath, "utf-8");
let isRunning = false;
const generateTypedRoutes = async (resolvedOptions_) => {
	const start = performance.now();
	try {
		const resolvedOptions = structuredClone(resolvedOptions_);
		if (isRunning) return logger.warn(`${PLUGIN_NAME} is already running`, { timestamp: true });
		else isRunning = true;
		const throwError = (message) => {
			throw new Error(message);
		};
		const useReplacements = (string) => {
			return string.split(/\*|:/g).join("");
		};
		const { routesPath, typedRouterPath } = resolvedOptions;
		let routesDefinitions = resolvedOptions.routesDefinitions;
		const hadSearchParamSchemas = Object.keys(resolvedOptions.searchParamsSchemas).length > 0;
		if (!node_fs.default.existsSync(routesPath) || !node_fs.default.lstatSync(routesPath).isDirectory()) throwError(`Routes directory not found at ${routesPath}`);
		const searchParamsImportsArray = [];
		const searchParamsExportsArray = [];
		const routesObject = {};
		if (routesDefinitions.length <= 0) try {
			const validPathRegex = /^(\w|\d|_|\-|\.|\\|\/|\[|\]|\(|\))+$/g;
			const routesFilesPaths = node_fs.default.readdirSync(routesPath, {
				recursive: true,
				encoding: "utf-8"
			}).reduce((acc, routePath) => {
				const absolutePath = node_path.default.resolve(routesPath, routePath);
				if (node_fs.default.lstatSync(absolutePath).isDirectory()) return acc;
				if (!routePath.match(validPathRegex)?.[0]) throwError(`Invalid route path "${routePath}". Routes must conform to the regex ${validPathRegex}`);
				acc.push(absolutePath);
				return acc;
			}, []);
			const build = await (0, rolldown.rolldown)({
				input: routesFilesPaths,
				logLevel: "silent"
			});
			const generated = await build.generate({});
			const output = generated.output.reduce((acc, file) => {
				if (!file.facadeModuleId) {
					const facadeModuleId = file.moduleIds.findLast((moduleId) => {
						return moduleId.startsWith(routesPath);
					});
					if (facadeModuleId) {
						file.facadeModuleId = facadeModuleId;
						acc.push(file);
					}
				} else acc.push(file);
				return acc;
			}, []).sort((a, b) => {
				return a.facadeModuleId.length - b.facadeModuleId.length;
			});
			for (let i = 0; i < output.length; i++) {
				const file = output[i];
				if (file.facadeModuleId) {
					const relativePath = node_path.default.relative(routesPath, file.facadeModuleId).replace(/\\/g, "/");
					const isRoute = !relativePath.startsWith("..");
					if (isRoute) {
						const ext = node_path.default.extname(relativePath);
						const extRegex = new RegExp(`\\${ext}$`);
						let routePath = relativePath.replace(extRegex, "").replace(/index$/, "").replace(/\[([^\/]+)\]/g, (_, m) => {
							if (m.length > 3 && m.startsWith("...")) return `*${m.slice(3)}`;
							if (m.length > 2 && m.startsWith("[") && m.endsWith("]")) return `:${m.slice(1, -1)}?`;
							return `:${m}`;
						}).replace(/\/\([^)/]+\)/g, "").replace(/\([^)/]+\)/g, "") || "/";
						let relativePathFromTypedRouter = node_path.default.relative(node_path.default.dirname(resolvedOptions.typedRouterPath), node_path.default.join(resolvedOptions.routesPath, relativePath)).replace(/\\/g, "/");
						if (!relativePathFromTypedRouter.startsWith(".")) relativePathFromTypedRouter = "./" + relativePathFromTypedRouter;
						const isValidRoute = relativePathFromTypedRouter.match(/\.tsx$/g);
						if (isValidRoute) {
							const routeParts = routePath.split("/").filter(Boolean);
							const routePartsReplaced = routeParts.map(useReplacements).filter(Boolean).map((routePart) => {
								return routePart.replace(/-+[\w|\d]/g, (match) => {
									return match.replaceAll("-", "").toUpperCase();
								});
							});
							const routePartsReplacedWithRoute = [...routePartsReplaced, "route"];
							routePath = routePath === "/" ? routePath : routeParts.join("/");
							if (routePath) {
								routePath = routePath.startsWith("/") ? routePath : `/${routePath}`;
								if (routePath === "/" || !routePath.endsWith("/")) (0, lodash_es_set_js.default)(routesObject, routePartsReplacedWithRoute, routePath);
							}
							const hasDefaultExport = file.exports.includes("default");
							const endpoints = file.exports.filter((export_) => {
								return [
									"GET",
									"POST",
									"PUT",
									"PATCH",
									"DELETE"
								].includes(export_);
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
								searchParamsImportsArray.push(`import type { searchParams as ${asName} } from "${relativePathFromTypedRouter}"`);
								let relativePathFromTypedSearchParams = node_path.default.relative(node_path.default.dirname(resolvedOptions.typedSearchParamsPath), node_path.default.join(resolvedOptions.routesPath, relativePath)).replace(/\\/g, "/");
								if (!relativePathFromTypedSearchParams.startsWith(".")) relativePathFromTypedSearchParams = "./" + relativePathFromTypedSearchParams;
								searchParamsExportsArray.push(`export { searchParams as ${asName} } from "${relativePathFromTypedSearchParams}"`);
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
		else {
			const newRoutesDefinitions = routesDefinitions.map((route) => {
				const componentPath = node_path.default.resolve(resolvedOptions.root, route.component);
				route.component = `$$$lazy(() => import('${componentPath}'))$$$`;
				return route;
			});
			routesDefinitions.length = 0;
			routesDefinitions.push(...newRoutesDefinitions);
		}
		const { StaticTypedRoutes, DynamicTypedRoutes, DynamicTypedRoutesParams } = routesDefinitions.reduce((acc, route) => {
			const routePath = route.path;
			if (!routePath || routePath !== "/" && routePath.endsWith("/")) return acc;
			const StaticOrDynamic = routePath.includes(":") || routePath.includes("*") ? "DynamicTypedRoutes" : "StaticTypedRoutes";
			acc[StaticOrDynamic] = acc[StaticOrDynamic].split(" | ").concat(`'${routePath}'`).join(" | ");
			if (StaticOrDynamic === "DynamicTypedRoutes") {
				const routeParams = acc.DynamicTypedRoutesParams[routePath] || [];
				const params = routePath.match(/(:|\*)([^/]+)/g) || [];
				for (let i = 0; i < params.length; i++) {
					const param = params[i];
					const parsedParam = useReplacements(param);
					if (routeParams.includes(parsedParam)) throwError(`Duplicate route parameter" ${param}" (parsed: "${parsedParam}") in "${routePath}"`);
					routeParams.push(parsedParam);
				}
				acc.DynamicTypedRoutesParams[routePath] = routeParams;
			}
			return acc;
		}, {
			StaticTypedRoutes: "",
			DynamicTypedRoutes: "",
			DynamicTypedRoutesParams: {}
		});
		const routes = JSON.stringify(defineRoutes(structuredClone(routesDefinitions).sort((a, b) => {
			return a.info.id.length - b.info.id.length;
		})), null, 2).replace(/('|"|`)?\${3}('|"|`)?/g, "");
		const routesMap = JSON.stringify(routesObject, null, 2);
		const searchParamsImports = searchParamsImportsArray.join("\n");
		const searchParamsExports = searchParamsExportsArray.join("\n");
		let searchParamsSchemas = JSON.stringify(resolvedOptions.searchParamsSchemas, null, 2);
		searchParamsSchemas = hadSearchParamSchemas ? searchParamsSchemas : searchParamsSchemas.replace(/: "([^"]+)"/g, ": $1");
		const SearchParamsRoutes = Object.keys(resolvedOptions.searchParamsSchemas).map((k) => `'${k}'`).join(" | ");
		if (node_process.default.env.PLUGIN_DEV) {
			typedRoutesTemplate = node_fs.default.readFileSync(typedRoutesTemplatePath, "utf-8");
			typedSearchParamsTemplate = node_fs.default.readFileSync(typedSearchParamsTemplatePath, "utf-8");
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
		node_fs.default.writeFileSync(typedRouterPath, typedRoutesFile);
		const typedSearchParamsFile = createOutputFile(typedSearchParamsTemplate, { searchParamsExports });
		node_fs.default.writeFileSync(resolvedOptions.typedSearchParamsPath, typedSearchParamsFile);
		logger.info(`Typed routes generated in ${Math.round(performance.now() - start)}ms`, { timestamp: true });
	} catch (error) {
		isRunning = false;
		if (error instanceof Error) throw error;
	}
	isRunning = false;
};
const pluginFilesDir = node_path.default.resolve(dirname, "..");
const vinxiCompatConfig = (config) => {
	try {
		const configAsAny = config;
		if (configAsAny?.router?.internals?.routes) {
			const router = configAsAny?.router?.internals?.routes;
			const getRoutes = router?.getRoutes?.bind(router);
			router.getRoutes = async () => {
				const routes = await getRoutes();
				return routes.map((route) => {
					if (route?.$component?.pick && !route?.$component?.pick.includes("searchParams")) route.$component.pick.push("searchParams");
					if (route?.$$route?.pick && !route?.$$route?.pick.includes("searchParams")) route.$$route.pick.push("searchParams");
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
	const pluginDev = !!node_process.default.env.PLUGIN_DEV;
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
					return node_path.default.join(pluginFilesDir, dir).replace(/\\/g, "/");
				}).some((src) => {
					return changePath.startsWith(src);
				});
				if (isPluginFile) return generateTypedRoutes(resolvedOptions);
			}
			const relative = node_path.default.relative(resolvedOptions.routesPath, changePath);
			const isRoute = relative && !relative.startsWith("..") && !node_path.default.isAbsolute(relative);
			if (isRoute) generateTypedRoutes(resolvedOptions);
		}
	};
};

//#endregion
exports.solidTypedRouterPlugin = solidTypedRouterPlugin