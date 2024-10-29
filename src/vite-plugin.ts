import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import type { RouteDefinition } from '@solidjs/router'
import { rollup } from 'rollup'
// import type dtsType from 'rollup-plugin-dts'
import type esbuildType from 'rollup-plugin-esbuild'
import type { BaseIssue, BaseSchema } from 'valibot'
import type { Plugin } from 'vite'
import { createLogger } from 'vite'

let esbuild: typeof esbuildType
// let dts: typeof dtsType
// import { defineConfig, mergeConfig } from 'vitest/config'
// import { tanstackViteConfig } from '@tanstack/config/vite'

const logger = createLogger('info', { prefix: '[solid-typed-routes]', allowClearScreen: true })

type Replacements = {
  ':': string
  '*': string
  '.': string
  '-': string
  '+': string
  [key: string]: string
}

type TypedRoutesOptions = {
  /**
   * Array of route definitions.
   * @default []
   */
  routesDefinitions?: RouteDefinition[]
  /**
   * Defintion of the search params schemas.
   */
  searchParamsSchemas?: Record<string, BaseSchema<unknown, unknown, BaseIssue<unknown>>>
  /**
   * The root directory of the project. If it's not an absolute path, it will be resolved relative to process.cwd().
   * @default process.cwd()
   */
  root?: string
  /**
   * The path to the routes directory. If it's not an absolute path, it will be resolved relative to options.root or process.cwd().
   * @default 'src/routes'
   */
  routesPath?: string
  /**
   * The path to the output file. If it's not an absolute path, it will be resolved relative to options.root or process.cwd().
   * @default 'src/typedRoutes.gen.ts'
   */
  outputPath?: string
  /**
   * Custom replacements for route parameters and route names.
   * @default { ':': '$', '*': '$$', '.': '_dot_', '-': '_dash_', '+': '_plus_' }
   */
  replacements?: Replacements
}

const DEFAULTS: Partial<TypedRoutesOptions> = {
  root: process.cwd(),
  routesPath: 'src/routes',
  outputPath: 'src/typedRoutes.gen.ts',
  routesDefinitions: [],
  searchParamsSchemas: {},
  replacements: {
    ':': '$',
    '*': '$$',
    '.': '_dot_',
    '-': '_dash_',
    '+': '_plus_',
  },
} as const

const resolveOptions = (options: TypedRoutesOptions): Required<TypedRoutesOptions> => {
  const replacements = Object.assign(
    {},
    DEFAULTS.replacements,
    options.replacements,
  ) as Replacements

  const resolvedOptions = Object.assign({}, DEFAULTS, options, {
    replacements,
  }) as Required<TypedRoutesOptions>

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
  const start = performance.now()

  try {
    if (isRunning) {
      return logger.warn('typed-routes is already running', { timestamp: true })
    }

    const throwError = (message: string) => {
      throw new Error(message)
    }

    isRunning = true

    const { root, routesPath, outputPath } = resolvedOptions

    let routesDefinitions = resolvedOptions.routesDefinitions

    if (!fs.existsSync(routesPath) || !fs.lstatSync(routesPath).isDirectory()) {
      throwError(`Routes directory not found at ${routesPath}`)
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
        logger.error(error, { timestamp: true })

        routesDefinitions = []
      }
    }

    // try {
    //   const validPathRegex = /^(\w|\d|_|\-|\.|\\|\/|\[|\]|\(|\))+$/g

    //   const routesFilesPaths = fs
    //     .readdirSync(routesPath, { recursive: true })
    //     .reduce((acc, routePath_) => {
    //       const routePath = routePath_.toString()
    //       const absolutePath = path.resolve(routesPath, routePath)

    //       if (fs.lstatSync(absolutePath).isDirectory()) return acc

    //       if (!routePath.match(validPathRegex)?.[0]) {
    //         throwError(
    //           `Invalid route path "${routePath}". Routes must conform to the regex ${validPathRegex}`,
    //         )
    //         // logger.info(`Invalid route path "${routePath}"`, { timestamp: true })
    //       } else {
    //         // logger.info(`Valid route path "${routePath}"`, { timestamp: true })
    //       }

    //       acc.push(absolutePath)

    //       return acc
    //     }, [] as string[])

    //   esbuild = esbuild || (await import('rollup-plugin-esbuild')).default
    //   // dts = dts || (await import('rollup-plugin-dts')).default

    //   const build = await rollup({
    //     input: routesFilesPaths,
    //     logLevel: 'silent',
    //     plugins: [esbuild({ target: 'esnext', logLevel: 'silent' })],
    //   })

    //   const generated = await build.generate({})

    //   const output = generated.output as (typeof generated.output)[0][]

    //   const newRoutesDefintions = [] as RouteDefinition[]

    //   for (let i = 0; i < output.length; i++) {
    //     const file = output[i]

    //     if (file.facadeModuleId) {
    //       const relativePath = path.relative(routesPath, file.facadeModuleId)

    //       const isRoute = !relativePath.startsWith('..')

    //       if (isRoute) {
    //         logger.warn(relativePath, { timestamp: true })

    //         const basename = path.basename(relativePath)
    //         const ext = path.extname(relativePath)

    //         let routePath = relativePath
    //           .replace(new RegExp(`\\${ext}$`), '')
    //           .replace(/\[\.{3}/g, '*')
    //           .replace(/\[([^\]]+)\]/g, ':$1')
    //           .replace(/\]/g, '')
    //           .replace(/\\/g, '/')
    //           .replace(/\(.+\)\/?/g, '')
    //           .replace(/^index$|\./g, '/')

    //         routePath = routePath.startsWith('/') ? routePath : `/${routePath}`

    //         if (basename.match(/\(.+\)\/?/g)) {
    //           routePath = ''
    //         }

    //         console.log({ routePath })

    //         if (file.exports.includes('searchParams')) {
    //           resolvedOptions.searchParamsSchemas[relativePath] = {} as any
    //         }
    //       }
    //     }
    //   }
    // } catch (error) {
    //   logger.error(error, { timestamp: true })
    // }

    const searchParamsImports = [] as string[]

    try {
      esbuild = esbuild || (await import('rollup-plugin-esbuild')).default

      const build = await rollup({
        input: routesDefinitions.map(route =>
          path.join(path.dirname(resolvedOptions.outputPath), route.info!.id + '.tsx'),
        ),
        logLevel: 'silent',
        plugins: [esbuild({ target: 'esnext', logLevel: 'silent' })],
      })

      const generated = await build.generate({})

      const output = generated.output as (typeof generated.output)[0][]

      for (let i = 0; i < output.length; i++) {
        const file = output[i]

        if (!file.facadeModuleId) {
          continue
        }

        if (file.exports.includes('searchParams')) {
          const route = routesDefinitions.find(route => {
            return (
              path
                .normalize(path.join(path.dirname(resolvedOptions.outputPath), route.info!.id))
                .replace('.tsx', '') === path.normalize(file.facadeModuleId!).replace('.tsx', '')
            )
          })

          const routePath = route?.path

          if (routePath) {
            const asName = `searchParams${searchParamsImports.length}`

            searchParamsImports.push(
              `import type { searchParams as ${asName} } from "${route.info!.id}"`,
            )

            resolvedOptions.searchParamsSchemas[routePath] = `{} as typeof ${asName}` as any
          }
        }
      }
    } catch (error) {
      logger.error(error, { timestamp: true })
    }

    const routes = JSON.stringify(defineRoutes(routesDefinitions), null, 2)
      // replace the recognizable string with the actual lazy import
      .replace(/('|"|`)?\${3}('|"|`)?/g, '')
      // https://stackoverflow.com/a/11233515/10019771
      .replace(/"([^"]+)":/g, '$1:')
      .replace(/\uFFFF/g, '\\"')

    const searchParamsSchemas = JSON.stringify(resolvedOptions.searchParamsSchemas, null, 2)
      // https://stackoverflow.com/a/11233515/10019771
      .replace(/: "([^"]+)"/g, ': $1')

    const SearchParamsRoutes = Object.keys(resolvedOptions.searchParamsSchemas)
      .map(k => `'${k}'`)
      .join(' | ')

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
            const routeParams = acc.DynamicTypedRoutesParams[route.path] || []

            const params = (route.path as string).match(/(:|\*)([^/]+)/g) || []

            for (let i = 0; i < params.length; i++) {
              const param = params[i]

              const parsedParam = Object.entries(resolvedOptions.replacements)
                .sort((a, b) => {
                  return b[1].length - a[1].length
                })
                .reduce((acc, [key, value]) => {
                  return acc.split(key).join(value)
                }, param)

              if (routeParams.includes(parsedParam)) {
                throwError(
                  `Duplicate route parameter" ${param}" (parsed: "${parsedParam}") in "${route.path}"`,
                )
              }

              routeParams.push(parsedParam)
            }

            acc.DynamicTypedRoutesParams[route.path] = routeParams
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
      let outputFile = ''

      // const banner = [
      //   '// IMPORTANT: This file is auto-generated by Solid Typed Routes. Do not edit it directly.',
      //   '',
      //   '/* prettier-ignore-start */',
      //   '',
      //   '/* eslint-disable */',
      //   '',
      //   '// @ts-nocheck',
      //   '',
      //   '// noinspection JSUnusedGlobalSymbols',
      //   '',
      //   '',
      // ].join('\n')

      // outputFile += banner

      outputFile += '\n'

      outputFile += searchParamsImports.join('\n')

      outputFile += '\n'

      const body = Object.entries(values).reduce((acc, [key, value]) => {
        return acc
          .split(`$$$${key}$$$`)
          .join(typeof value !== 'string' ? JSON.stringify(value, null, 2) : value)
      }, outputFileTemplate)

      outputFile += body

      outputFile = outputFile.replaceAll('// @ts-ignore', '')

      return outputFile
    }

    const outputFile = createOutputFile({
      ...resolvedOptions,
      routes,
      searchParamsSchemas,
      SearchParamsRoutes,
      StaticTypedRoutes,
      DynamicTypedRoutes,
      DynamicTypedRoutesParams,
    })

    fs.writeFileSync(outputPath, outputFile)

    logger.info(`Typed routes generated in ${Math.round(performance.now() - start)}ms`, {
      timestamp: true,
    })
  } catch (error) {
    isRunning = false

    if (error instanceof Error) {
      throw error
    }
  } finally {
    isRunning = false
  }
}

const pluginFilesDir = path.resolve(import.meta.dirname, '..')

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
export const solidTypedRoutesPlugin = (options: TypedRoutesOptions = DEFAULTS) => {
  const pluginDev = !!process.env.PLUGIN_DEV

  pluginDev && logger.info('Development mode of the plugin', { timestamp: true })

  const resolvedOptions = resolveOptions(options)

  generateTypedRoutes(resolvedOptions)

  return {
    name: 'solid-typed-routes',
    api: 'serve',
    buildStart() {
      pluginDev && this.addWatchFile(pluginFilesDir)

      generateTypedRoutes(resolvedOptions)
    },
    // configureServer(server) {
    //   pluginDev && server.watcher.add(pluginFilesDir)
    // },
    watchChange(changePath) {
      if (pluginDev) {
        const pluginRelative = path.relative(pluginFilesDir, changePath)
        const isPluginFile =
          pluginRelative && !pluginRelative.startsWith('..') && !path.isAbsolute(pluginRelative)

        if (isPluginFile) {
          return generateTypedRoutes(resolvedOptions)
        }
      }

      const relative = path.relative(resolvedOptions.routesPath, changePath)
      const isRoute = relative && !relative.startsWith('..') && !path.isAbsolute(relative)

      if (isRoute) {
        generateTypedRoutes(resolvedOptions)
      }
    },
  } satisfies Plugin
}
