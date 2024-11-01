import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import url from 'node:url'
import type { RouteDefinition as SolidRouteDefinition } from '@solidjs/router'
import type SetType from 'lodash-es/set'
import { rollup } from 'rollup'
import type EsbuildPluginType from 'rollup-plugin-esbuild'
import type { BaseIssue, BaseSchema } from 'valibot'
import type { Plugin } from 'vite'
import { createLogger } from 'vite'

const dirname = import.meta.dirname || path.dirname(url.fileURLToPath(import.meta.url))

const esbuildPluginImport = import('rollup-plugin-esbuild')
let esbuildPlugin: typeof EsbuildPluginType

const setImport = import('lodash-es/set.js')
let set: typeof SetType

const PLUGIN_NAME = 'solid-typed-routes'

const logger = createLogger('info', { prefix: `[${PLUGIN_NAME}]`, allowClearScreen: true })

type RouteDefinition = Omit<SolidRouteDefinition, 'component'> & {
  /**
   * The path to the component file.
   */
  component: string
}

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
   * @default 'src/typedRouter.gen.ts'
   */
  typedRouterPath?: string
  /**
   * The path to the output file. If it's not an absolute path, it will be resolved relative to options.root or process.cwd().
   * @default 'src/typedSearchParams.gen.ts'
   */
  typedSearchParamsPath?: string
  /**
   * Custom replacements for route parameters and route names.
   * @default { ':': '$', '*': '$$', '.': '_dot_', '-': '_dash_', '+': '_plus_' }
   */
  replacements?: Replacements
}

const DEFAULTS: Partial<TypedRoutesOptions> = {
  root: process.cwd(),
  routesPath: 'src/routes',
  typedRouterPath: 'src/typedRouter.gen.ts',
  typedSearchParamsPath: 'src/typedSearchParams.gen.ts',
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
  const copiedOptions = structuredClone(options)

  const replacements = Object.assign(
    {},
    DEFAULTS.replacements,
    copiedOptions.replacements,
  ) as Replacements

  const resolvedOptions = Object.assign({}, DEFAULTS, copiedOptions, {
    replacements,
  }) as Required<TypedRoutesOptions>

  resolvedOptions.root = path.isAbsolute(resolvedOptions.root)
    ? resolvedOptions.root
    : path.resolve(process.cwd(), resolvedOptions.root)

  resolvedOptions.routesPath = path.isAbsolute(resolvedOptions.routesPath)
    ? resolvedOptions.routesPath
    : path.resolve(resolvedOptions.root, resolvedOptions.routesPath)

  resolvedOptions.typedRouterPath = path.isAbsolute(resolvedOptions.typedRouterPath)
    ? resolvedOptions.typedRouterPath
    : path.resolve(resolvedOptions.root, resolvedOptions.typedRouterPath)

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
      routes.push(route)

      return routes
    }

    route!.info!.fullPath = full
    route.path = route.path.replace(new RegExp(`^${parentRoute.path}`), '')

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

const typedRoutesTemplatePath = path.resolve(dirname, '..', 'static', 'typedRouter.template.ts')

let typedRoutesTemplate = fs.readFileSync(typedRoutesTemplatePath, 'utf-8')

const typedSearchParamsTemplatePath = path.resolve(
  dirname,
  '..',
  'static',
  'typedSearchParams.template.ts',
)

let typedSearchParamsTemplate = fs.readFileSync(typedSearchParamsTemplatePath, 'utf-8')

let isRunning = false

const generateTypedRoutes = async (resolvedOptions_: Required<TypedRoutesOptions>) => {
  esbuildPlugin = esbuildPlugin || (await esbuildPluginImport).default
  set = set || (await setImport).default

  const start = performance.now()

  try {
    const resolvedOptions = structuredClone(resolvedOptions_)

    if (isRunning) {
      return logger.warn(`${PLUGIN_NAME} is already running`, { timestamp: true })
    } else {
      isRunning = true
    }

    const throwError = (message: string) => {
      throw new Error(message)
    }

    const useReplacements = (string: string) => {
      return Object.entries(resolvedOptions.replacements)
        .sort((a, b) => {
          return b[1].length - a[1].length
        })
        .reduce((acc, [key, value]) => {
          return acc.split(key).join(value)
        }, string)
    }

    const { routesPath, typedRouterPath } = resolvedOptions

    let routesDefinitions = resolvedOptions.routesDefinitions
    const hadSearchParamSchemas = Object.keys(resolvedOptions.searchParamsSchemas).length > 0

    if (!fs.existsSync(routesPath) || !fs.lstatSync(routesPath).isDirectory()) {
      throwError(`Routes directory not found at ${routesPath}`)
    }

    const searchParamsImportsArray = [] as string[]
    const searchParamsExportsArray = [] as string[]
    const routesObject = {} as Record<string, any>

    if (routesDefinitions.length <= 0) {
      try {
        const validPathRegex = /^(\w|\d|_|\-|\.|\\|\/|\[|\]|\(|\))+$/g

        const routesFilesPaths = fs
          .readdirSync(routesPath, { recursive: true })
          .reduce((acc, routePath_) => {
            const routePath = routePath_.toString()
            const absolutePath = path.resolve(routesPath, routePath)

            if (fs.lstatSync(absolutePath).isDirectory()) return acc

            if (!routePath.match(validPathRegex)?.[0]) {
              throwError(
                `Invalid route path "${routePath}". Routes must conform to the regex ${validPathRegex}`,
              )
            }

            acc.push(absolutePath)

            return acc
          }, [] as string[])

        const build = await rollup({
          input: routesFilesPaths,
          logLevel: 'silent',
          plugins: [esbuildPlugin({ target: 'esnext', logLevel: 'silent' })],
        })

        const generated = await build.generate({})

        const output = generated.output as (typeof generated.output)[0][]

        for (let i = 0; i < output.length; i++) {
          const file = output[i]

          if (file.facadeModuleId) {
            const relativePath = path.relative(routesPath, file.facadeModuleId).replace(/\\/g, '/')

            const isRoute = !relativePath.startsWith('..')

            if (isRoute) {
              // const basename = path.basename(relativePath)
              const ext = path.extname(relativePath)

              let routePath = relativePath
                .replace(new RegExp(`\\${ext}$`), '')
                .replace(/\[\.{3}/g, '*')
                .replace(/\[([^\]]+)\]/g, ':$1')
                .replace(/\]/g, '')
                .replace(/\\/g, '/')
                .replace(/\/?\(.+\)/g, '')
                .replace(/^index$/g, '/')
                .replace(/index$/g, '')

              routePath = routePath
                ? routePath.startsWith('/')
                  ? routePath
                  : `/${routePath}`
                : routePath

              // if (basename.match(/\(.+\)\/?/g)) {
              //   routePath = ''
              // }

              let relativePathFromTypedRouter = path
                .relative(
                  path.dirname(resolvedOptions.typedRouterPath),
                  path.join(resolvedOptions.routesPath, relativePath),
                )
                .replace(/\\/g, '/')

              if (!relativePathFromTypedRouter.startsWith('.')) {
                relativePathFromTypedRouter = './' + relativePathFromTypedRouter
              }

              const isRoute = relativePathFromTypedRouter.endsWith('.tsx')

              if (isRoute) {
                if (routePath === '/' || !routePath.endsWith('/')) {
                  set(
                    routesObject,
                    [...routePath.split('/').filter(Boolean).map(useReplacements), 'route'],
                    routePath || '/',
                  )
                }

                routesDefinitions.push({
                  path: routePath,
                  component:
                    `$$$lazy(() => import('${relativePathFromTypedRouter.replace(new RegExp(`\\${ext}$`), '')}'))$$$` as any,
                  info: {
                    id: '/' + relativePath.replace(new RegExp(`\\${ext}$`), ''),
                  },
                })

                console.log(routesDefinitions.at(-1)?.info?.id)

                if (
                  file.exports.includes('searchParams') &&
                  !resolvedOptions.searchParamsSchemas[routePath]
                ) {
                  const asName = `searchParams${searchParamsImportsArray.length}`

                  searchParamsImportsArray.push(
                    `import type { searchParams as ${asName} } from "${relativePathFromTypedRouter}"`,
                  )

                  let relativePathFromTypedSearchParams = path
                    .relative(
                      path.dirname(resolvedOptions.typedSearchParamsPath),
                      path.join(resolvedOptions.routesPath, relativePath),
                    )
                    .replace(/\\/g, '/')

                  if (!relativePathFromTypedSearchParams.startsWith('.')) {
                    relativePathFromTypedSearchParams = './' + relativePathFromTypedSearchParams
                  }

                  searchParamsExportsArray.push(
                    `export { searchParams as ${asName} } from "${relativePathFromTypedSearchParams}"`,
                  )

                  resolvedOptions.searchParamsSchemas[routePath] = `{} as typeof ${asName}` as any
                }
              }
            }
          }
        }
      } catch (error) {
        logger.error(error, { timestamp: true })

        routesDefinitions = []
      }
    } else {
      const newRoutesDefinitions = routesDefinitions.map(route => {
        const componentPath = path.resolve(resolvedOptions.root, route.component)

        route.component = `$$$lazy(() => import('${componentPath}'))$$$` as any

        return route
      })

      routesDefinitions.length = 0
      routesDefinitions.push(...newRoutesDefinitions)
    }

    const { StaticTypedRoutes, DynamicTypedRoutes, DynamicTypedRoutesParams } =
      routesDefinitions.reduce(
        (acc, route) => {
          if (!route.path || (route.path !== '/' && route.path.endsWith('/'))) {
            return acc
          }

          const StaticOrDynamic =
            route.path.includes(':') || route.path.includes('*')
              ? 'DynamicTypedRoutes'
              : 'StaticTypedRoutes'

          acc[StaticOrDynamic] = acc[StaticOrDynamic]
            .split(' | ')
            .concat(`'${route.path}'`)
            .join(' | ')

          if (StaticOrDynamic === 'DynamicTypedRoutes') {
            const routeParams = acc.DynamicTypedRoutesParams[route.path] || []

            const params = (route.path as string).match(/(:|\*)([^/]+)/g) || []

            for (let i = 0; i < params.length; i++) {
              const param = params[i]

              const parsedParam = useReplacements(param)

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

    const routes = JSON.stringify(defineRoutes(structuredClone(routesDefinitions)), null, 2)
      // replace the recognizable string with the actual lazy import
      .replace(/('|"|`)?\${3}('|"|`)?/g, '')
      // https://stackoverflow.com/a/11233515/10019771
      .replace(/"([^"]+)":/g, '$1:')
      .replace(/\uFFFF/g, '\\"')

    const routesMap = JSON.stringify(routesObject, null, 2) // https://stackoverflow.com/a/11233515/10019771
      .replace(/"([^"]+)":/g, '$1:')
      .replace(/\uFFFF/g, '\\"')

    const searchParamsImports = searchParamsImportsArray.join('\n')
    const searchParamsExports = searchParamsExportsArray.join('\n')

    let searchParamsSchemas = JSON.stringify(resolvedOptions.searchParamsSchemas, null, 2)

    searchParamsSchemas = hadSearchParamSchemas
      ? searchParamsSchemas
      : // https://stackoverflow.com/a/11233515/10019771
        searchParamsSchemas.replace(/: "([^"]+)"/g, ': $1')

    const SearchParamsRoutes = Object.keys(resolvedOptions.searchParamsSchemas)
      .map(k => `'${k}'`)
      .join(' | ')

    if (process.env.PLUGIN_DEV) {
      typedRoutesTemplate = fs.readFileSync(typedRoutesTemplatePath, 'utf-8')
      typedSearchParamsTemplate = fs.readFileSync(typedSearchParamsTemplatePath, 'utf-8')
    }

    const createOutputFile = (template: string, values: Record<string, any>) => {
      let outputFile = ''

      const banner = [
        '// IMPORTANT: This file is auto-generated by Solid Typed Routes. Do not edit it directly, it will be overwritten.',
        '',
        '/* prettier-ignore-start */',
        '',
        '/* eslint-disable */',
        '',
        '// @ts-nocheck',
        '',
        '// noinspection JSUnusedGlobalSymbols',
        '',
      ].join('\n')

      outputFile += banner

      const body = Object.entries(values).reduce((acc, [key, value]) => {
        const replacement =
          (typeof value !== 'string' ? JSON.stringify(value, null, 2) : value) || "''"

        return acc.split(`$$$${key}$$$`).join(replacement)
      }, template)

      outputFile += body

      outputFile = outputFile.replaceAll('// @ts-ignore', '')

      return outputFile
    }

    const typedRoutesFile = createOutputFile(typedRoutesTemplate, {
      ...resolvedOptions,
      routes,
      routesMap,
      searchParamsSchemas,
      searchParamsImports,
      SearchParamsRoutes,
      StaticTypedRoutes,
      DynamicTypedRoutes,
      DynamicTypedRoutesParams,
    })

    fs.writeFileSync(typedRouterPath, typedRoutesFile)

    const typedSearchParamsFile = createOutputFile(typedSearchParamsTemplate, {
      searchParamsExports,
    })

    fs.writeFileSync(resolvedOptions.typedSearchParamsPath, typedSearchParamsFile)

    logger.info(`Typed routes generated in ${Math.round(performance.now() - start)}ms`, {
      timestamp: true,
    })
  } catch (error) {
    isRunning = false

    if (error instanceof Error) {
      throw error
    }
  }

  isRunning = false
}

const pluginFilesDir = path.resolve(dirname, '..')

/**
 * A Vite plugin for generating typed routes for Solid applications.
 *
 * @param {TypedRoutesOptions} [options] - The options for configuring the typed routes.
 * @returns {Plugin} The configured Vite plugin.
 *
 * @example
 * ```typescript
 * import { solidTypedRouterPlugin } from './vite-plugin';
 *
 * export default {
 *   plugins: [solidTypedRouterPlugin({ /* options *\/ })],
 * };
 * ```
 *
 * @remarks
 * This plugin generates typed routes based on the provided options and regenerates them
 * whenever there are changes in the route files.
 *
 * @function
 * @name solidTypedRouterPlugin
 */
export const solidTypedRouterPlugin = (
  // options: TypedRoutesOptions = DEFAULTS,
  options: Omit<TypedRoutesOptions, 'searchParamsSchemas'> = DEFAULTS,
): any => {
  const pluginDev = !!process.env.PLUGIN_DEV

  pluginDev && logger.error('Development mode', { timestamp: true })

  const resolvedOptions = resolveOptions(options)

  generateTypedRoutes(resolvedOptions)

  return {
    name: 'solid-typed-routes',
    // enforce: 'post',
    buildStart() {
      pluginDev && this.addWatchFile(pluginFilesDir)

      generateTypedRoutes(resolvedOptions)
    },
    configResolved(config) {
      try {
        const configAsAny = config as any
        // force compatibility with vinxi/solid-start
        if (configAsAny?.app?.config?.name === 'vinxi' && configAsAny?.router?.internals?.routes) {
          const router = configAsAny?.router?.internals?.routes

          const getRoutes = router?.getRoutes?.bind(router)

          router.getRoutes = async () => {
            const routes = await getRoutes()

            return routes.map(route => {
              if (route?.$component?.pick) {
                route.$component.pick.push('searchParams')
              }

              if (route?.$$route?.pick) {
                route.$$route.pick.push('searchParams')
              }

              return route
            })
          }
        }
      } catch (error) {
        logger.warn(error)
      }

      // return config
    },
    watchChange(changePath) {
      if (pluginDev) {
        const isPluginFile = ['src', 'static']
          .map(dir => {
            return path.join(pluginFilesDir, dir).replace(/\\/g, '/')
          })
          .some(src => {
            return changePath.startsWith(src)
          })

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
