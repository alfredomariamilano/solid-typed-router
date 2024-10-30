import type { NavigateOptions, RouteDefinition } from '@solidjs/router'
import { A, useNavigate, useSearchParams } from '@solidjs/router'
import type { ComponentProps, JSX } from 'solid-js'
import { lazy, splitProps } from 'solid-js'
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
    [K in DynamicTypedRoutesParams[T][number]]: string | number
  }
}

export type TypedNavigateOptions<T extends TypedRoutes> = T extends DynamicTypedRoutes
  ? Partial<NavigateOptions> & DynamicTypedRouteParams<T>
  : Partial<NavigateOptions> | undefined

interface TypedNavigator {
  <T extends TypedRoutes>(to: T, options: TypedNavigateOptions<T>): void
  (delta: number): void
}

export const getTypedRoute = <T extends TypedRoutes>(
  href: T,
  params: T extends DynamicTypedRoutes ? Pick<DynamicTypedRouteParams<T>, 'params'> : never,
) => {
  let parsedLink = href

  if (params) {
    Object.keys(params).forEach(key => {
      const dynamicParamKey = Object.entries(replacements)
        .sort((a, b) => {
          return b[1].length - a[1].length
        })
        .reduce(
          (acc, [key, value]) => {
            return acc.split(value).join(key)
          },
          key as keyof DynamicTypedRouteParams<DynamicTypedRoutes>['params'],
        )

      parsedLink = parsedLink.split(dynamicParamKey).join(params[key]) as T
    })
  }

  return parsedLink
}

export const useTypedNavigate = () => {
  const navigate = useNavigate()

  const typedNavigate: TypedNavigator = (...args) => {
    const newArgs = args

    if (typeof args[0] === 'string') {
      args[0] = getTypedRoute(args[0] as TypedRoutes, args[1]?.params)
    }

    return navigate(...(newArgs as Parameters<typeof navigate>))
  }

  return typedNavigate
}

export type TypedLinkProps<T extends TypedRoutes> = Omit<ComponentProps<typeof A>, 'href'> & {
  search?: `?${string}`
  href: T
} & (T extends DynamicTypedRoutes ? DynamicTypedRouteParams<T> : { params?: never })

export function TypedLink<T extends TypedRoutes>(props: TypedLinkProps<T>): JSX.Element {
  const [link, rest] = splitProps(props, ['href', 'params', 'search'])

  const href = () => {
    return getTypedRoute(link.href, link.params as any)
  }

  return A({ ...rest, href: `${href()}${link.search || ''}` })
}
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
    return safeParse<SearchParamsSchema>(searchParamsSchemas[schema], params).output as SearchParams
  }

  const typedSearchParams = () => {
    return parse(searchParams)
  }

  const setTypedSearchParams = (
    params: Partial<SearchParams>,
    options?: Partial<NavigateOptions>,
  ) => {
    return setSearchParams(parse(params), options)
  }

  return [typedSearchParams(), setTypedSearchParams] as const
}

declare module '@solidjs/router' {
  interface Navigator {
    <T extends TypedRoutes>(to: T, options: TypedNavigateOptions<T>): void
    (delta: number): void
  }
}
