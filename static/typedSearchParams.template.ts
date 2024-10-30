// @ts-ignore
$$$searchParamsImports$$$
import type { NavigateOptions } from '@solidjs/router'
import { useSearchParams } from '@solidjs/router'
import { createMemo } from 'solid-js'
import type { BaseIssue, BaseSchema, InferInput } from 'valibot'
import { safeParse } from 'valibot'

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
      console.log(error)

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
      Object.entries(parse(params)).reduce((acc, [key, value]) => {
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
