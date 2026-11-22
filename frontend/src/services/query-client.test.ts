import { QueryClient, useQuery } from '@tanstack/react-query'
import { waitFor } from '@testing-library/react'
import { AxiosError, AxiosHeaders } from 'axios'
import { describe, expect, it, vi } from 'vitest'

import { renderHookWithProviders } from '../test/render'
import { ApiError } from './api-error'
import { queryClient, shouldRetryQuery } from './query-client'

const axiosError = (status: number) =>
  new AxiosError('fail', 'ERR', undefined, undefined, {
    status,
    statusText: '',
    data: {},
    headers: {},
    config: { headers: new AxiosHeaders() },
  })

// Admin review 20/11 #4: an unknown id showed a skeleton for ~7 s while the 404 was retried 3 times.
describe('shouldRetryQuery', () => {
  it.each([400, 401, 403, 404, 409, 422])('does not retry a %i answer', (status) => {
    expect(shouldRetryQuery(0, new ApiError(status, 'X', 'x'))).toBe(false)
    expect(shouldRetryQuery(0, axiosError(status))).toBe(false)
  })

  it.each([0, 408, 429, 500, 503])('retries a %i answer up to 3 times', (status) => {
    const error = new ApiError(status, 'X', 'x')
    expect(shouldRetryQuery(0, error)).toBe(true)
    expect(shouldRetryQuery(2, error)).toBe(true)
    expect(shouldRetryQuery(3, error)).toBe(false)
  })

  it('retries an unknown error', () => {
    expect(shouldRetryQuery(0, new Error('boom'))).toBe(true)
  })
})

describe('app query client', () => {
  // A client with the app's defaults (retry policy), and no wait between retries.
  const appClient = () =>
    new QueryClient({
      defaultOptions: { queries: { ...queryClient.getDefaultOptions().queries, retryDelay: 0 } },
    })

  it('shows a 404 at once: one request, then the error', async () => {
    const fetchToy = vi.fn().mockRejectedValue(new ApiError(404, 'TOY_NOT_FOUND', 'Không tìm thấy tin đăng.'))
    const { result } = renderHookWithProviders(
      () => useQuery({ queryKey: ['toy', 'missing'], queryFn: fetchToy }),
      appClient(),
    )

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('Không tìm thấy tin đăng.')
    expect(fetchToy).toHaveBeenCalledTimes(1)
  })

  it('still retries a server error before showing it', async () => {
    const fetchToy = vi.fn().mockRejectedValue(new ApiError(500, 'INTERNAL', 'Lỗi máy chủ'))
    const { result } = renderHookWithProviders(
      () => useQuery({ queryKey: ['toy', 'server-error'], queryFn: fetchToy }),
      appClient(),
    )

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(fetchToy).toHaveBeenCalledTimes(4)
  })
})
