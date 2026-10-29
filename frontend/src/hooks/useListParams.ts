import { useCallback, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { z } from 'zod'

import { MAX_PAGE_LIMIT, type PaginationParams } from '../types/api'

const toPositiveInt = (value: string | null, fallback: number): number => {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

// The filters of one list: a zod object whose keys are URL params and whose fields never throw
// (use the helpers in src/schemas/list-params.ts, which fall back with .catch).
type FilterSchema = z.ZodObject<Record<string, z.ZodType>>

// Filters without the empty ones: optional fields become `key?: value` (never `key: undefined`).
type DefinedFilters<T> = {
  [K in keyof T as undefined extends T[K] ? never : K]: T[K]
} & {
  [K in keyof T as undefined extends T[K] ? K : never]?: Exclude<T[K], undefined>
}

interface ListParamsOptions<S extends FilterSchema, SortField extends string> {
  // Filters this list reads from the URL, e.g. z.object({ status: enumParam(...), q: searchParam }).
  schema: S
  // Sortable fields (the backend's sortBy enum of this list). Other values in the URL are ignored.
  sortFields?: readonly SortField[]
  defaultLimit?: number
}

// Page, limit, sort and filters of a list kept in the URL (?page=2&status=PENDING), so a list
// survives reloads and can be shared. Filters are validated with the list's zod schema, so a
// broken URL falls back to the defaults. Changing a filter or the sort goes back to page 1.
export const useListParams = <S extends FilterSchema, SortField extends string = never>({
  schema,
  sortFields,
  defaultLimit = 10,
}: ListParamsOptions<S, SortField>) => {
  const [searchParams, setSearchParams] = useSearchParams()

  const page = toPositiveInt(searchParams.get('page'), 1)
  // Capped at the backend maximum, so ?limit=500 shows 100 rows instead of a 400 error.
  const limit = Math.min(toPositiveInt(searchParams.get('limit'), defaultLimit), MAX_PAGE_LIMIT)
  const sortByParam = searchParams.get('sortBy')
  const sortBy = sortFields?.find((field) => field === sortByParam)
  const sortOrderParam = searchParams.get('sortOrder')
  const sortOrder: 'asc' | 'desc' | undefined =
    sortBy && (sortOrderParam === 'asc' || sortOrderParam === 'desc') ? sortOrderParam : undefined

  const filters = useMemo(() => {
    const raw: Record<string, string | undefined> = {}
    for (const key of Object.keys(schema.shape)) raw[key] = searchParams.get(key) ?? undefined
    // A field without .catch would throw on a broken URL: fall back to the schema defaults.
    const parsed = schema.safeParse(raw)
    return (parsed.success ? parsed.data : schema.parse({})) as z.output<S>
  }, [schema, searchParams])

  // Ready to pass to the api function (also a good part of a query key). Empty filters are left
  // out, so they never reach the query string.
  const params = useMemo(() => {
    const defined = Object.fromEntries(
      Object.entries(filters).filter(([, value]) => value !== undefined),
    ) as DefinedFilters<z.output<S>>
    return {
      page,
      limit,
      ...(sortBy ? { sortBy } : {}),
      ...(sortOrder ? { sortOrder } : {}),
      ...defined,
    } satisfies PaginationParams
  }, [page, limit, sortBy, sortOrder, filters])

  const update = useCallback(
    (changes: Record<string, string | number | undefined>, resetPage: boolean, replace = false) => {
      setSearchParams((current) => {
        const next = new URLSearchParams(current)
        for (const [key, value] of Object.entries(changes)) {
          if (value === undefined || value === '') next.delete(key)
          else next.set(key, String(value))
        }
        if (resetPage) next.delete('page')
        return next
      }, { replace })
    },
    [setSearchParams],
  )

  type FilterKey = keyof z.output<S> & string

  const setPage = useCallback(
    (nextPage: number, nextLimit?: number) => update({ page: nextPage, limit: nextLimit }, false),
    [update],
  )
  const setFilter = useCallback(
    (key: FilterKey, value: string | undefined) => update({ [key]: value }, true),
    [update],
  )
  const setFilters = useCallback(
    (values: Partial<Record<FilterKey, string | undefined>>) => update(values, true),
    [update],
  )
  const setSort = useCallback(
    (field: SortField | undefined, order: 'asc' | 'desc' | undefined) =>
      update({ sortBy: field, sortOrder: field ? order : undefined }, true),
    [update],
  )
  const reset = useCallback(() => setSearchParams(new URLSearchParams()), [setSearchParams])

  return {
    page,
    limit,
    sortBy,
    sortOrder,
    filters,
    params,
    setPage,
    setFilter,
    setFilters,
    setSort,
    reset,
    update,
  }
}

// Goes back to the last page when the list shrank under the current page (e.g. after a delete,
// or ?page=9 of a 2-page list): replaces the URL so Back does not return to the empty page.
export const useClampPage = (
  page: number,
  totalPages: number | undefined,
  update: (changes: Record<string, string | number | undefined>, resetPage: boolean, replace?: boolean) => void,
) => {
  useEffect(() => {
    if (totalPages === undefined) return
    const last = Math.max(1, totalPages)
    if (page > last) update({ page: last > 1 ? last : undefined }, false, true)
  }, [page, totalPages, update])
}
