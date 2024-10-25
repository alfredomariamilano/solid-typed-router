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
declare const solidTypedRoutesPlugin: (options: TypedRoutesOptions) => {
    readonly name: "solid-typed-routes";
    readonly buildStart: (this: rollup.PluginContext) => void;
    readonly watchChange: (this: rollup.PluginContext, changePath: string) => void;
};

export { solidTypedRoutesPlugin };
