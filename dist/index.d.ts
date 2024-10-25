import { RouteDefinition } from '@solidjs/router';
import { Plugin } from 'vite';

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
declare const solidTypedRoutesPlugin: (options: TypedRoutesOptions) => Plugin;

export { solidTypedRoutesPlugin };
