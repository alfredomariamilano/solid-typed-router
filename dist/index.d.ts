import * as rollup from 'rollup';
import { RouteDefinition } from '@solidjs/router';

type TypedRoutesOptions = {
    routesDefinitions?: RouteDefinition[];
    root?: string;
    routesPath?: string;
    outputPath?: string;
    dynamicParamsPrefix?: string;
    dynamicCatchAllParamsPrefix?: string;
    dotReplacement?: string;
    dashReplacement?: string;
};
/**
 * A Vite plugin for generating typed routes for Solid applications.
 *
 * @param {TypedRoutesOptions} options - The options for configuring the typed routes.
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
declare const solidTypedRoutesPlugin: (options: TypedRoutesOptions) => {
    name: string;
    buildStart(this: rollup.PluginContext): void;
    watchChange(this: rollup.PluginContext, changePath: string): void;
};

export { solidTypedRoutesPlugin };
