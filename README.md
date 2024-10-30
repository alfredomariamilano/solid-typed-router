# Solid Typed Routes Plugin

A Vite plugin for generating typed routes for Solid.js applications. This plugin also creates search params validation if you export a `searchParams` object from the route.

## Installation

This plugin is still in active development and it is not published on npm or other registries. To try it out, install via
```bash
npm i git+https://github.com/alfredomariamilano/solid-typed-router.git --save-dev
```

## Usage

Add the plugin to your Vite configuration:
```javascript
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { solidTypedRoutesPlugin } from 'solid-typed-routes-plugin';

export default defineConfig({
  plugins: [
    solid(),
    solidTypedRoutesPlugin({
      // options
    }),
  ],
});
```

## Options

The plugin accepts the following options:

- routesDefinitions (default: []): Array of route definitions.
- searchParamsSchemas (default: {}): Definition of the search params schemas.
- root (default: process.cwd()): The root directory of the project.
- routesPath (default: 'src/routes'): The path to the routes directory.
- outputPath (default: 'src/typedRoutes.gen.ts'): The path to the output file.
- replacements (default: { ':': '$', '*': '$$', '.': '_dot_', '-': '_dash_', '+': '_plus_' }): Custom replacements for route parameters and route names.

## Search Params Validation

If you export a searchParams object from a route, the plugin will automatically create search params validation for that route. You need valibot >= 1.
```javascript
import { createSearchParams } from "@/generated/typedRoutes.gen"
import { object, optional, pipe, string, transform } from "valibot"

const searchParamsSchema = optional(
    object({
      thing: string(),
    }),
    {
      thing: 'thing',
    },
  )

export const searchParams = createSearchParams('/thisroute', searchParamsSchema)
```