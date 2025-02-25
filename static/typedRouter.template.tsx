// @ts-ignore
$$$searchParamsImports$$$
import type { MatchFilters, NavigateOptions, Params, RouteDefinition } from '@solidjs/router'
import { A, useMatch, useNavigate, useParams, useSearchParams } from '@solidjs/router'
import type { Accessor, ComponentProps, JSX } from 'solid-js'
import { createMemo, lazy, splitProps } from 'solid-js'
import type { BaseIssue, BaseSchema, InferInput } from 'valibot'
import { safeParse } from 'valibot'
import { type Options as DeepMergeOptions, default as _deepMerge } from 'deepmerge'

// @ts-ignore
export const replacements: Record<string, string> = $$$replacements$$$ as const
// @ts-ignore
export const routes = $$$routes$$$ as const satisfies RouteDefinition[]
// @ts-ignore
export const routesMap = $$$routesMap$$$ as const
// @ts-ignore
export type StaticTypedRoutes = $$$StaticTypedRoutes$$$
// @ts-ignore
export type DynamicTypedRoutes = $$$DynamicTypedRoutes$$$
// @ts-ignore
export type DynamicTypedRoutesParams = $$$DynamicTypedRoutesParams$$$

export type TypedRoutes = StaticTypedRoutes | DynamicTypedRoutes

export type DynamicTypedRouteParams<T extends DynamicTypedRoutes> = {
  [K in DynamicTypedRoutesParams[T][number]]: string
}

export type TypedNavigateOptions<T extends TypedRoutes> = Partial<NavigateOptions> &
  (T extends DynamicTypedRoutes ? { params: DynamicTypedRouteParams<T> } : {}) &
  (T extends SearchParamsRoutes ? { search?: InferInput<(typeof searchParamsSchemas)[T]> } : {})

interface TypedNavigator {
  <const T extends DynamicTypedRoutes>(to: T, options: TypedNavigateOptions<T>): void
  <const T extends StaticTypedRoutes>(to: T, options?: TypedNavigateOptions<T>): void
  (delta: number): void
}

export function useReplacements (string: string, flip?: boolean) {
  const maybeFlippedReplacements = flip
    ? Object.fromEntries(Object.entries(replacements).map(([a, b]) => [b, a]))
    : replacements

  return Object.entries(maybeFlippedReplacements)
    .sort((a, b) => {
      return b[0].length - a[0].length
    })
    .reduce((acc, [key, value]) => {
      if (!key) return acc

      return acc.split(key).join(value)
    }, string)
}

export function getTypedRoute<T extends TypedRoutes>(
  href: T,
  params: T extends DynamicTypedRoutes ? DynamicTypedRouteParams<T> : never,
  search?: T extends SearchParamsRoutes
    ? InferInput<(typeof searchParamsSchemas)[T]>
    : SearchParamsGeneric,
) {
  let parsedLink = href

  if (params) {
    Object.keys(params).forEach(key => {
      const dynamicParamKey = useReplacements(key, true)

      if (dynamicParamKey === key) {
        parsedLink = parsedLink.split(new RegExp(`[\\*|:]${key}`)).join(params[key]) as T
      } else {
        parsedLink = parsedLink.split(dynamicParamKey).join(params[key]) as T
      }
    })
  }

  if (search) {
    const searchParams = new URLSearchParams()
    const parsedSearch = parseSearchParams(href as SearchParamsRoutes, search)

    Object.entries(parsedSearch).forEach(([key, value]) => {
      try {
        searchParams.set(key, JSON.stringify(value))
      } catch {
        searchParams.set(key, value as any)
      }
    })

    parsedLink = `${parsedLink}?${searchParams.toString()}` as T
  }

  return parsedLink
}

export function useTypedNavigate  ()  {
  const navigate = useNavigate()

  const typedNavigate: TypedNavigator = (...args) => {
    const newArgs = (() => {
      try {
        return typeof structuredClone !== 'undefined'
          ? structuredClone(args)
          : JSON.parse(JSON.stringify(args))
      } catch {
        return [args[0], { ...args[1] }]
      }
    })()

    if (typeof args[0] === 'string') {
      newArgs[0] = getTypedRoute(newArgs[0] as TypedRoutes, newArgs[1]?.params, newArgs[1]?.search)
    }

    return navigate(...(newArgs as Parameters<typeof navigate>))
  }

  return typedNavigate
}

export function useTypedMatch <T extends TypedRoutes>(
  path: () => T,
  matchFilters?: MatchFilters<T>,
) {
  return useMatch(path, matchFilters) as unknown as Accessor<
    { path: T; params: Params[T] } | undefined
  >
}

export function useTypedParams <const T extends DynamicTypedRoutes>(route: T)  {
  const params = useParams<DynamicTypedRouteParams<T>>()

  const typedParams = createMemo(() => {
    const routeParts = route.split('/').filter(Boolean)

    return Object.entries(params).reduce(
      (acc, [key, value]) => {
        for (const routePart of routeParts) {
          Object.entries(replacements).forEach(([left]) => {
            if (routePart.replace(left, '') === key) {
              acc[useReplacements(routePart)] = value
            }
          })
        }

        return acc
      },
      {} as DynamicTypedRouteParams<T>,
    )
  })

  return typedParams
}

export type TypedLinkProps<T extends TypedRoutes> = Omit<ComponentProps<typeof A>, 'href'> & {
  search?: SearchParamsGeneric
  href: T
} & (T extends DynamicTypedRoutes ? { params: DynamicTypedRouteParams<T> } : { params?: never }) &
  (T extends SearchParamsRoutes ? { search?: InferInput<(typeof searchParamsSchemas)[T]> } : {})

export function TypedLink<T extends TypedRoutes>(props: TypedLinkProps<T>): JSX.Element {
  const [link, rest] = splitProps(props, ['href', 'params', 'search'])

  const href = () => {
    return getTypedRoute(link.href, link.params, link.search)
  }

  // @ts-ignore
  return <A {...rest} href={href()} />
}

type SearchParamsGeneric = Record<any, any>
// @ts-ignore
type SearchParamsRoutes = $$$SearchParamsRoutes$$$
// @ts-ignore
export const searchParamsSchemas = $$$searchParamsSchemas$$$

export function createSearchParams<
  const T extends BaseSchema<unknown, unknown, BaseIssue<unknown>>,
>(route: SearchParamsRoutes, schema: T) {
  ;(searchParamsSchemas as any)[route] = schema

  return schema
}

export function parseSearchParams<const T extends SearchParamsRoutes>(
  schema: T,
  params: Partial<SearchParams<T>>,
) {
  try {
    const decodedParams = Object.entries(params).reduce((acc, [key, value]) => {
      try {
        acc[key] = JSON.parse(value as any)
      } catch {
        acc[key] = value
      }

      return acc
    }, {})

    return safeParse<SearchParamsSchema<T>>(searchParamsSchemas[schema], decodedParams)
      .output as SearchParams<T>
  } catch (error) {
    if (searchParamsSchemas[schema]) {
      if (searchParamsSchemas[schema]['~validate']) {
        console.warn(error)
      } else {
        console.warn(
          `No search params validation found for route: ${schema}. If you want to use typed search params, you need to preload the route`,
        )
      }
    } else {
      console.warn(
        `No search params schema found for route: ${schema}. If you want to use typed search params, you need to define a schema for this route.`,
      )
    }

    return params as SearchParams<T>
  }
}

type SearchParamsSchema<T extends SearchParamsRoutes> = (typeof searchParamsSchemas)[T]
type SearchParams<T extends SearchParamsRoutes> = InferInput<SearchParamsSchema<T>>

export function useTypedSearchParams<const T extends SearchParamsRoutes>(schema: T) {
  const [searchParams, setSearchParams] = useSearchParams<SearchParams<T>>()

  const parse = (params: Partial<SearchParams<T>>) => {
    return parseSearchParams(schema, params)
  }

  const typedSearchParams = createMemo(() => {
    return parse(
      Object.entries(searchParams).reduce((acc, [key, value]) => {
        try {
          acc[key] = JSON.parse(value as any)
        } catch {
          acc[key] = value
        }

        return acc
      }, {}),
    )
  })

  const setTypedSearchParams = (
    params: Partial<SearchParams<T>>,
    options?: Partial<NavigateOptions>,
  ) => {
    return setSearchParams(
      Object.entries(
        parse(
          deepMerge(typedSearchParams(), params),
        ),
      ).reduce((acc, [key, value]) => {
        try {
          if (typeof value === 'object') {
            acc[key] = JSON.stringify(value)
          } else {
            acc[key] = value
          }
        } catch {
          acc[key] = value
        }

        return acc
      }, {}),
      options,
    )
  }

  return [typedSearchParams, setTypedSearchParams] as const
}

const deepMergeOptions: DeepMergeOptions = {
  arrayMerge: (_targetArray, sourceArray, options) => {
    const destination = sourceArray.slice()

    sourceArray.forEach((item, index) => {
      if (typeof destination[index] === 'undefined') {
        destination[index] = options?.cloneUnlessOtherwiseSpecified(item, options)
      } else if (options?.isMergeableObject(item)) {
        destination[index] = deepMerge(sourceArray[index], item, options)
      } else if (sourceArray.indexOf(item) === -1) {
        destination.push(item)
      }
    })

    return destination
  },
  clone: true,
  
}

function deepMerge(
  x: object = {},
  y: object = {},
  options = deepMergeOptions,
) {
  return _deepMerge(x, y, options)
}

declare module '@solidjs/router' {
  interface Navigator {
    <T extends TypedRoutes>(to: T, options: TypedNavigateOptions<T>): void
    (delta: number): void
  }
}
