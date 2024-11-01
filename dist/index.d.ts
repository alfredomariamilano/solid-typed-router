import { RouteDefinition as RouteDefinition$1 } from '@solidjs/router';
import { BaseSchema, BaseIssue } from 'valibot';

type RouteDefinition = Omit<RouteDefinition$1, 'component'> & {
    /**
     * The path to the component file.
     */
    component: string;
};
type Replacements = {
    ':': string;
    '*': string;
    '.': string;
    '-': string;
    '+': string;
    [key: string]: string;
};
type TypedRoutesOptions = {
    /**
     * Array of route definitions.
     * @default []
     */
    routesDefinitions?: RouteDefinition[];
    /**
     * Defintion of the search params schemas.
     */
    searchParamsSchemas?: Record<string, BaseSchema<unknown, unknown, BaseIssue<unknown>>>;
    /**
     * The root directory of the project. If it's not an absolute path, it will be resolved relative to process.cwd().
     * @default process.cwd()
     */
    root?: string;
    /**
     * The path to the routes directory. If it's not an absolute path, it will be resolved relative to options.root or process.cwd().
     * @default 'src/routes'
     */
    routesPath?: string;
    /**
     * The path to the output file. If it's not an absolute path, it will be resolved relative to options.root or process.cwd().
     * @default 'src/typedRouter.gen.ts'
     */
    typedRouterPath?: string;
    /**
     * The path to the output file. If it's not an absolute path, it will be resolved relative to options.root or process.cwd().
     * @default 'src/typedSearchParams.gen.ts'
     */
    typedSearchParamsPath?: string;
    /**
     * Custom replacements for route parameters and route names.
     * @default { ':': '$', '*': '$$', '.': '_dot_', '-': '_dash_', '+': '_plus_' }
     */
    replacements?: Replacements;
};
/**
 * A Vite plugin for generating typed routes for Solid applications.
 *
 * @param {TypedRoutesOptions} [options] - The options for configuring the typed routes.
 * @returns {Plugin} The configured Vite plugin.
 *
 * @example
 * ```typescript
 * import { solidTypedRoutesPlugin } from './vite-plugin';
 *
 * export default {
 *   plugins: [solidTypedRoutesPlugin({ /* options *\/ })],
 * };
 * ```
 *
 * @remarks
 * This plugin generates typed routes based on the provided options and regenerates them
 * whenever there are changes in the route files.
 *
 * @function
 * @name solidTypedRoutesPlugin
 */
declare const solidTypedRoutesPlugin: (options?: Omit<TypedRoutesOptions, "searchParamsSchemas">) => any;

export { solidTypedRoutesPlugin };
