# Solid Typed Routes Plugin

A Vite plugin for generating typed routes for Solid.js applications. This plugin also creates search params validation if you export a `searchParams` object from the route.

## Github repo

If you're not already here, see the Github repo [HERE](https://github.com/alfredomariamilano/solid-typed-router)

## Demo

See a working demo on Stackblitz [HERE](https://stackblitz.com/github/alfredomariamilano/solid-hack-typed-routes?file=README.md)

## Installation

This plugin is still in active development. To try it out, install via
```bash
npm i @bizarreal/vite-plugin-solid-typed-router --save-dev
```

## Usage

Add the plugin to your Vite configuration:
```typescript
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { solidTypedRouterPlugin } from '@bizarreal/vite-plugin-solid-typed-router';

export default defineConfig({
  plugins: [
    solid(),
    solidTypedRouterPlugin({
      // options
    }),
  ],
});
```

## Options

The plugin accepts the following options:

- routesDefinitions (default: `[]`): Array of route definitions.
- searchParamsSchemas (default: `{}`): Definition of the search params schemas.
- root (default: `process.cwd()`): The root directory of the project.
- routesPath (default: `'src/routes'`): The path to the routes directory.
- typedRouterPath (default: `'src/typedRouter.gen.ts'`): The path to the typed routes file.
- typedSearchParamsPath (default: `'src/typedSearchParams.gen.ts'`): The path to the typed search params file.
- replacements (default: `{ ':': '$', '*': '$$', '.': '_dot_', '-': '_dash_', '+': '_plus_' }`): Custom replacements for route parameters and route names.

## Search Params Validation

If you export a searchParams object from a route, the plugin will automatically create search params validation for that route. You need `valibot` >= 1 installed. Do so by running `npm i valibot@^1.0.0-beta.5`.
```typescript
import { createSearchParams } from "@/generated/typedRouter.gen"
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

If you want to use the search params from other routes other than the current one, you can either import the generated `typedSearchParams.gen.ts` file in your app's entry
```typescript
import '~/typedSearchParams.gen.ts'
```
or you will have to preload the route
```typescript
// The example is in Solid Start
import type { RouteDefinition } from '@solidjs/router'

export const route = {
  preload() {
    // do anything  or nothing at all
  } as RouteDefinition
}
```

## Recommendations

I recommend users to add `**/*.gen.ts` (or the specific paths you use for the generated files) to their `.gitignore`.