import { useQuery } from '@tanstack/react-query'
import { act, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '../services/api-error'
import { deferred, renderHookWithProviders } from '../test/render'
import { useApiMutation } from './useApiMutation'

const listKey = ['items'] as const

// An active list query (so invalidation refetches it) next to the mutation under test.
const setup = (
  mutationFn: () => Promise<string>,
  options: { refetchOnStale?: boolean | readonly number[]; successMessage?: string } = {},
) => {
  const list = vi.fn().mockResolvedValue(['first'])
  const view = renderHookWithProviders(() => ({
    list: useQuery({ queryKey: listKey, queryFn: list }),
    mutation: useApiMutation<string, void>({ mutationFn, invalidate: [listKey], ...options }),
  }))
  return { list, ...view }
}

describe('useApiMutation', () => {
  it('refetches the lists after success and shows the success message', async () => {
    const { list, result } = setup(async () => 'ok', { successMessage: 'Đã lưu.' })
    await waitFor(() => expect(result.current.list.data).toEqual(['first']))

    await act(() => result.current.mutation.mutateAsync())

    expect(list).toHaveBeenCalledTimes(2)
    expect(await screen.findByText('Đã lưu.')).toBeInTheDocument()
  })

  it.each([404, 409, 422])(
    'after a %i, refetches the lists and stays pending until the refetch is done',
    async (status) => {
      const { list, result } = setup(
        async () => {
          throw new ApiError(status, 'STALE', 'Dữ liệu đã thay đổi.')
        },
        { refetchOnStale: true },
      )
      await waitFor(() => expect(result.current.list.data).toEqual(['first']))
      expect(list).toHaveBeenCalledTimes(1)

      const refetch = deferred<string[]>()
      list.mockReturnValueOnce(refetch.promise)
      act(() => result.current.mutation.mutate())

      await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
      // The error is known, but the mutation waits for the fresh list.
      expect(result.current.mutation.isPending).toBe(true)
      expect(await screen.findByText('Dữ liệu đã thay đổi.')).toBeInTheDocument()

      await act(async () => refetch.resolve(['fresh']))
      await waitFor(() => expect(result.current.mutation.isError).toBe(true))
      expect(result.current.list.data).toEqual(['fresh'])
    },
  )

  it('does not refetch after other errors, or when refetchOnStale is off', async () => {
    const failWith = (status: number) => async () => {
      throw new ApiError(status, 'ERR', `Lỗi ${status}`)
    }
    const badRequest = setup(failWith(400), { refetchOnStale: true })
    const conflictWithoutOption = setup(failWith(409))
    await waitFor(() => expect(badRequest.result.current.list.data).toBeDefined())
    await waitFor(() => expect(conflictWithoutOption.result.current.list.data).toBeDefined())

    await act(async () => {
      await badRequest.result.current.mutation.mutateAsync().catch(() => undefined)
      await conflictWithoutOption.result.current.mutation.mutateAsync().catch(() => undefined)
    })

    expect(badRequest.list).toHaveBeenCalledTimes(1)
    expect(conflictWithoutOption.list).toHaveBeenCalledTimes(1)
  })

  it('refetches only on the statuses given as a list', async () => {
    const { list, result } = setup(
      async () => {
        throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy.')
      },
      { refetchOnStale: [409] },
    )
    await waitFor(() => expect(result.current.list.data).toBeDefined())
    await act(() => result.current.mutation.mutateAsync().catch(() => undefined))
    expect(list).toHaveBeenCalledTimes(1)
  })
})
