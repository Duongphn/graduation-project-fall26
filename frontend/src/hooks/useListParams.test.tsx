import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { enumParam, searchParam } from '../schemas/list-params'
import { useClampPage, useListParams } from './useListParams'

const renderAt = <T,>(url: string, hook: () => T) =>
  renderHook(hook, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
    ),
  })

const safeSchema = z.object({ status: enumParam(['ACTIVE', 'HIDDEN']), q: searchParam })
// Fields without .catch: a broken URL makes safeParse fail.
const strictSchema = z.object({
  status: z.enum(['ACTIVE', 'HIDDEN']).optional(),
  minAge: z.coerce.number().int().optional(),
})

describe('useListParams', () => {
  it('reads page, limit, sort and filters from the URL', () => {
    const { result } = renderAt(
      '/list?page=3&limit=20&sortBy=name&sortOrder=desc&status=HIDDEN&q=%20g%E1%BB%97%20',
      () => useListParams({ schema: safeSchema, sortFields: ['name', 'createdAt'] }),
    )
    expect(result.current.params).toEqual({
      page: 3,
      limit: 20,
      sortBy: 'name',
      sortOrder: 'desc',
      status: 'HIDDEN',
      q: 'gỗ',
    })
  })

  it.each([
    ['500', 100],
    ['100', 100],
    ['abc', 10],
    ['-5', 10],
    ['2.5', 10],
  ])('reads ?limit=%s as %i (capped at the backend maximum)', (limit, expected) => {
    const { result } = renderAt(`/list?limit=${limit}`, () => useListParams({ schema: safeSchema }))
    expect(result.current.limit).toBe(expected)
  })

  it.each(['0', '-2', 'x', '1.5'])('falls back to page 1 for ?page=%s', (page) => {
    const { result } = renderAt(`/list?page=${page}`, () => useListParams({ schema: safeSchema }))
    expect(result.current.page).toBe(1)
  })

  it('ignores an unknown sort field and a sort order without a field', () => {
    const { result } = renderAt('/list?sortBy=password&sortOrder=asc', () =>
      useListParams({ schema: safeSchema, sortFields: ['name'] }),
    )
    expect(result.current.params).toEqual({ page: 1, limit: 10 })
  })

  it('drops a garbage filter that has .catch and keeps the others', () => {
    const { result } = renderAt('/list?status=DELETED&q=xe', () =>
      useListParams({ schema: safeSchema }),
    )
    expect(result.current.params).toEqual({ page: 1, limit: 10, q: 'xe' })
  })

  it('falls back to the schema defaults when safeParse fails, instead of throwing', () => {
    const { result } = renderAt('/list?status=GARBAGE&minAge=abc', () =>
      useListParams({ schema: strictSchema }),
    )
    expect(result.current.filters).toEqual({})
    expect(result.current.params).toEqual({ page: 1, limit: 10 })
  })
})

describe('useClampPage', () => {
  it('moves to the last page, replacing the URL, when the list shrank', () => {
    const update = vi.fn()
    renderHook(() => useClampPage(9, 2, update))
    expect(update).toHaveBeenCalledWith({ page: 2 }, false, true)
  })

  it('removes ?page when only one page (or none) is left', () => {
    const update = vi.fn()
    renderHook(() => useClampPage(3, 0, update))
    expect(update).toHaveBeenCalledWith({ page: undefined }, false, true)
  })

  it('does nothing while the total is unknown or the page exists', () => {
    const update = vi.fn()
    renderHook(() => useClampPage(5, undefined, update))
    renderHook(() => useClampPage(2, 2, update))
    expect(update).not.toHaveBeenCalled()
  })
})
