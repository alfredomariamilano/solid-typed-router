// @ts-ignore
$$$searchParamsImports$$$
import type { MatchFilters, NavigateOptions, Params, RouteDefinition } from '@solidjs/router'
import { A, useMatch, useNavigate, useParams, useSearchParams } from '@solidjs/router'
import mergeWith from 'lodash-es/mergeWith'
import type { Accessor, ComponentProps, JSX } from 'solid-js'
import { createMemo, lazy, splitProps } from 'solid-js'
import type { BaseIssue, BaseSchema, InferInput } from 'valibot'
import { safeParse } from 'valibot'
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

// export type TypedLinkProps = Omit<AnchorProps> & {}

// export const TypedLink = (props) => {
//   return A(props)
// }

type DynamicTypedRouteParams<T extends DynamicTypedRoutes> = {
  params: {
    [K in DynamicTypedRoutesParams[T][number]]: string
    // [K in DynamicTypedRoutesParams[T][number]]: string | number
  }
}

export type TypedNavigateOptions<T extends TypedRoutes> = T extends DynamicTypedRoutes
  ? Partial<NavigateOptions> & DynamicTypedRouteParams<T>
  : Partial<NavigateOptions>

interface TypedNavigator {
  <const T extends DynamicTypedRoutes>(to: T, options: TypedNavigateOptions<T>): void
  <const T extends StaticTypedRoutes>(to: T, options?: TypedNavigateOptions<T>): void
  (delta: number): void
}

export const useReplacements = (string: string, flip?: boolean) => {
  const maybeFlippedReplacements = flip
    ? Object.fromEntries(Object.entries(replacements).map(([a, b]) => [b, a]))
    : replacements

  return Object.entries(maybeFlippedReplacements)
    .sort((a, b) => {
      return b[0].length - a[0].length
    })
    .reduce((acc, [key, value]) => {
      return acc.split(key).join(value)
    }, string)
}

export const getTypedRoute = <T extends TypedRoutes>(
  href: T,
  params: T extends DynamicTypedRoutes ? Pick<DynamicTypedRouteParams<T>, 'params'> : never,
  search?: T extends SearchParamsRoutes
    ? InferInput<(typeof searchParamsSchemas)[T]>
    : SearchParamsGeneric,
) => {
  let parsedLink = href

  if (params) {
    Object.keys(params).forEach(key => {
      const dynamicParamKey = useReplacements(key, true)

      parsedLink = parsedLink.split(dynamicParamKey).join(params[key]) as T
    })
  }

  if (search) {
    console.log({ search })
    const searchParams = new URLSearchParams()

    Object.entries(search).forEach(([key, value]) => {
      searchParams.set(key, JSON.stringify(value))
    })

    parsedLink = `${parsedLink}?${searchParams.toString()}` as T
  }

  return parsedLink
}

export const useTypedNavigate = () => {
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

export const useTypedMatch = <T extends TypedRoutes>(
  path: () => T,
  matchFilters?: MatchFilters<T>,
) => {
  return useMatch(path, matchFilters) as unknown as Accessor<
    { path: T; params: Params[T] } | undefined
  >
}

export const useTypedParams = <const T extends DynamicTypedRoutes>(route: T) => {
  const params = useParams<DynamicTypedRouteParams<T>['params']>()

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
      {} as DynamicTypedRouteParams<T>['params'],
    )
  })

  return typedParams
}

export type TypedLinkProps<T extends TypedRoutes> = Omit<ComponentProps<typeof A>, 'href'> & {
  search?: SearchParamsGeneric
  href: T
} & (T extends DynamicTypedRoutes ? DynamicTypedRouteParams<T> : { params?: never }) &
  (T extends SearchParamsRoutes ? { search?: InferInput<(typeof searchParamsSchemas)[T]> } : {})

export function TypedLink<T extends TypedRoutes>(props: TypedLinkProps<T>): JSX.Element {
  const [link, rest] = splitProps(props, ['href', 'params', 'search'])

  const href = () => {
    return getTypedRoute(link.href, link.params, link.search)
  }

  return A({ ...rest, href: href() })
}

type SearchParamsGeneric = Record<any, any>
// @ts-ignore
type SearchParamsRoutes = $$$SearchParamsRoutes$$$
// @ts-ignore
export const searchParamsSchemas = $$$searchParamsSchemas$$$
// as const satisfies Record<
//   string,
//   BaseSchema<unknown, unknown, BaseIssue<unknown>>
// >

export function createSearchParams<
  const T extends BaseSchema<unknown, unknown, BaseIssue<unknown>>,
>(route: SearchParamsRoutes, schema: T) {
  ;(searchParamsSchemas as any)[route] = schema

  return schema
}

export function useTypedSearchParams<const T extends SearchParamsRoutes>(schema: T) {
  type SearchParamsSchema = (typeof searchParamsSchemas)[T]
  type SearchParams = InferInput<SearchParamsSchema>

  const [searchParams, setSearchParams] = useSearchParams<SearchParams>()

  const parse = (params: Partial<SearchParams>) => {
    try {
      return safeParse<SearchParamsSchema>(searchParamsSchemas[schema], params)
        .output as SearchParams
    } catch (error) {
      console.warn(error)

      return params as SearchParams
    }
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
    params: Partial<SearchParams>,
    options?: Partial<NavigateOptions>,
  ) => {
    return setSearchParams(
      Object.entries(
        parse(
          mergeWith(typedSearchParams(), params, (source, destination) => {
            if (Array.isArray(source)) {
              return destination
            }
          }),
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

declare module '@solidjs/router' {
  interface Navigator {
    <T extends TypedRoutes>(to: T, options: TypedNavigateOptions<T>): void
    (delta: number): void
  }
}
