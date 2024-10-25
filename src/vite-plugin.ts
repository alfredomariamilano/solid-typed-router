import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import type { RouteDefinition } from '@solidjs/router'
// import type { Options } from 'camelcase'
import type { Plugin } from 'vite'
// import { defineConfig, mergeConfig } from 'vitest/config'
// import { tanstackViteConfig } from '@tanstack/config/vite'

type TypedRoutesOptions = {
  routesDefinitions?: RouteDefinition[]
  root?: string
  routesPath?: string
  outputPath?: string
  dynamicParamsPrefix?: string
  dynamicCatchAllParamsPrefix?: string
  dotReplacement?: string
  dashReplacement?: string
}

const DEFAULTS: Partial<TypedRoutesOptions> = {
  root: process.cwd(),
  routesPath: 'src/routes',
  outputPath: 'src/typedRoutes.gen.ts',
  routesDefinitions: [],
  // biome-ignore format: allow dollar signs
  dynamicParamsPrefix: '\$',
  // biome-ignore format: allow dollar signs
  dynamicCatchAllParamsPrefix: '\$\$',
  dotReplacement: '_dot_',
  dashReplacement: '_dash_',
}

const resolveOptions = (options: TypedRoutesOptions): Required<TypedRoutesOptions> => {
  const resolvedOptions = Object.assign({}, DEFAULTS, options) as Required<TypedRoutesOptions>

  resolvedOptions.root = path.isAbsolute(resolvedOptions.root)
    ? resolvedOptions.root
    : path.resolve(process.cwd(), resolvedOptions.root)

  resolvedOptions.routesPath = path.isAbsolute(resolvedOptions.routesPath)
    ? resolvedOptions.routesPath
    : path.resolve(resolvedOptions.root, resolvedOptions.routesPath)

  resolvedOptions.outputPath = path.isAbsolute(resolvedOptions.outputPath)
    ? resolvedOptions.outputPath
    : path.resolve(resolvedOptions.root, resolvedOptions.outputPath)

  return resolvedOptions
}

function defineRoutes(fileRoutes: RouteDefinition[]) {
  function processRoute(
    routes: RouteDefinition[],
    route: RouteDefinition,
    id: string,
    full: string,
  ) {
    const parentRoute = Object.values(routes).find(o => {
      return id.startsWith(o.info!.id + '/')
    })

    if (!parentRoute) {
      routes.push({
        ...route,
        // info: { id },
        // path: id.replace(/\/\([^)/]+\)/g, '').replace(/\([^)/]+\)/g, ''),
      })
      return routes
    }

    processRoute(
      (parentRoute.children || (parentRoute.children = [])) as RouteDefinition[],
      route,
      id.slice(parentRoute.info!.id.length),
      full,
    )
    return routes
  }
  return fileRoutes
    .sort((a, b) => a.path.length - b.path.length)
    .reduce((prevRoutes, route) => {
      route.info = route.info || {}
      route.info.id = route.info.id || route.path

      return processRoute(prevRoutes, route, route.info!.id, route.path)
    }, [] as RouteDefinition[])
}

const findNodeModules = (root: string) => {
  const nodeModulesPath = path.resolve(root, 'node_modules')

  if (fs.existsSync(nodeModulesPath)) {
    return nodeModulesPath
  }

  const parentDir = path.resolve(root, '..')

  if (parentDir === root) {
    return
  }

  return findNodeModules(parentDir)
}

const outputFileTemplatePath = path.resolve(
  import.meta.dirname,
  '..',
  'static',
  'outputFileTemplate.ts',
)

let isRunning = false

const generateTypedRoutes = async (resolvedOptions: Required<TypedRoutesOptions>) => {
  try {
    if (isRunning) {
      return console.log('typed-routes is already running')
    }

    isRunning = true

    const { root, routesPath, outputPath } = resolvedOptions

    let routesDefinitions = resolvedOptions.routesDefinitions

    if (!fs.existsSync(routesPath) || !fs.lstatSync(routesPath).isDirectory()) {
      throw new Error(`Routes directory not found at ${routesPath}`)
    }

    if (routesDefinitions.length <= 0) {
      try {
        let SolidStartServerFileRouter!: any
        let routesPluginInit!: any

        try {
          const require = createRequire(root)

          const solidStartConfigPath = path.dirname(require.resolve('@solidjs/start/config'))

          const fileSysteRouterPath = pathToFileURL(
            path.resolve(solidStartConfigPath, 'fs-router.js'),
          ).pathname

          SolidStartServerFileRouter = (await import(fileSysteRouterPath))
            .SolidStartServerFileRouter

          const nodeModulesPath = solidStartConfigPath.split('node_modules')[0] + 'node_modules'

          const vinxiPath = path.resolve(nodeModulesPath, 'vinxi')

          const routesPluginPath = pathToFileURL(
            path.resolve(vinxiPath, 'lib/plugins/routes.js'),
          ).pathname

          routesPluginInit = (await import(routesPluginPath)).routes
        } catch {
          const nodeModulesPath = findNodeModules(root) || root

          const fileSysteRouterPath = pathToFileURL(
            path.resolve(nodeModulesPath, '@solidjs/start/config/fs-router.js'),
          ).pathname

          SolidStartServerFileRouter = (await import(fileSysteRouterPath))
            .SolidStartServerFileRouter

          const routesPluginPath = pathToFileURL(
            path.resolve(nodeModulesPath, 'vinxi/lib/plugins/routes.js'),
          ).pathname

          routesPluginInit = (await import(routesPluginPath)).routes
        }

        const fileRouter = new SolidStartServerFileRouter(
          {
            dir: routesPath,
            extensions: ['ts', 'tsx'],
          },
          {},
          {},
        )

        const routesPlugin = routesPluginInit()

        routesPlugin.configResolved({
          root: routesPath,
          router: {
            target: 'server',
            name: 'solid',
            internals: {
              routes: fileRouter,
            },
          },
        })

        const routesCode = (await routesPlugin.load('vinxi/routes'))
          .replaceAll(`"filePath":"${root}/src/`, '"filePath":"')
          .replace(/"\$[^\}]+/g, 'noop')
          .replaceAll('noop},', '')
          .replace(/\.tsx/g, '')
          .replace('export default', '')
          .trim()

        const routes = JSON.parse(routesCode) as {
          page: boolean
          path: string
          filePath: string
        }[]

        routesDefinitions = routes.reduce<RouteDefinition[]>((acc, route) => {
          if (!route.page) {
            return acc
          }

          const relativeFilePath = [
            './',
            path.relative(path.dirname(outputPath), route.filePath).replace(/\\/g, '/'),
          ].join('')

          acc.push({
            path: route.path.replace(/\/\([^)/]+\)/g, '').replace(/\([^)/]+\)/g, ''),
            // use a recongnizable string that can be replaced later
            component: `$$$lazy(() => import('${relativeFilePath}'))$$$` as any,
            info: {
              id: relativeFilePath,
            },
          })

          return acc
        }, [])
      } catch (error) {
        console.error(error)

        routesDefinitions = []
      }
    }

    // const camelcaseImport = await import('camelcase')

    // const camelcase = (camelcaseImport.default || camelcaseImport) as unknown as (
    //   input: string | readonly string[],
    //   options?: Options,
    // ) => string

    const routes = JSON.stringify(defineRoutes(routesDefinitions), null, 2)
      // replace the recognizable string with the actual lazy import
      .replace(/('|"|`)?\${3}('|"|`)?/g, '')
      // https://stackoverflow.com/a/11233515/10019771
      .replace(/"([^"]+)":/g, '$1:')
      .replace(/\uFFFF/g, '\\"')

    const { StaticTypedRoutes, DynamicTypedRoutes, DynamicTypedRoutesParams } =
      routesDefinitions.reduce(
        (acc, route) => {
          if (!route.path) return acc

          const StaticOrDynamic =
            route.path.includes(':') || route.path.includes('*')
              ? 'DynamicTypedRoutes'
              : 'StaticTypedRoutes'

          acc[StaticOrDynamic] = acc[StaticOrDynamic]
            ? acc[StaticOrDynamic] + ' | '
            : acc[StaticOrDynamic]

          acc[StaticOrDynamic] += `'${route.path}'`

          if (StaticOrDynamic === 'DynamicTypedRoutes') {
            acc.DynamicTypedRoutesParams[route.path] =
              acc.DynamicTypedRoutesParams[route.path] || []

            const params = (route.path as string).match(/(:|\*)([^/]+)/g) || []

            for (let i = 0; i < params.length; i++) {
              const param = params[i]

              acc.DynamicTypedRoutesParams[route.path].push(
                // camelcase(
                //   param
                //     .split(':')
                //     .join(resolvedOptions.dynamicParamsPrefix)
                //     .split('*')
                //     .join(resolvedOptions.dynamicCatchAllParamsPrefix),
                // ),
                param
                  .split(':')
                  .join(resolvedOptions.dynamicParamsPrefix)
                  .split('*')
                  .join(resolvedOptions.dynamicCatchAllParamsPrefix)
                  .split('.')
                  .join(resolvedOptions.dotReplacement)
                  .split('-')
                  .join(resolvedOptions.dashReplacement),
              )
            }
          }

          return acc
        },
        {
          StaticTypedRoutes: '',
          DynamicTypedRoutes: '',
          DynamicTypedRoutesParams: {},
        },
      )

    // TODO: move it outside the function
    const outputFileTemplate = fs.readFileSync(outputFileTemplatePath, 'utf-8')

    const createOutputFile = (values: Record<string, any>) => {
      return Object.entries(values).reduce((acc, [key, value]) => {
        return acc
          .split(`$$$${key}$$$`)
          .join(typeof value !== 'string' ? JSON.stringify(value, null, 2) : value)
      }, outputFileTemplate)
    }

    const outputFile = createOutputFile({
      ...resolvedOptions,
      routes,
      StaticTypedRoutes,
      DynamicTypedRoutes,
      DynamicTypedRoutesParams,
    })

    fs.writeFileSync(outputPath, outputFile)
  } catch (error) {
    isRunning = false

    if (error instanceof Error) {
      throw error
    }
  } finally {
    isRunning = false
  }
}

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
export const solidTypedRoutesPlugin = (options: TypedRoutesOptions) => {
  const resolvedOptions = resolveOptions(options)

  generateTypedRoutes(resolvedOptions)

  return {
    name: 'solid-typed-routes',
    buildStart() {
      generateTypedRoutes(resolvedOptions)
    },
    watchChange(changePath) {
      const relative = path.relative(resolvedOptions.routesPath, changePath)
      const isRoute = relative && !relative.startsWith('..') && !path.isAbsolute(relative)

      if (isRoute) {
        generateTypedRoutes(resolvedOptions)
      }
    },
  } satisfies Plugin
}
