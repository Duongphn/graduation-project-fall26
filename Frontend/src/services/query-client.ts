import { QueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'

import { ApiError } from './api-error'

const isClientError = (error: unknown): boolean => {
  const status =
    error instanceof ApiError
      ? error.status
      : isAxiosError(error)
        ? error.response?.status
        : undefined
  return status !== undefined && status >= 400 && status < 500
}

/** Dùng chung cho React (QueryClientProvider) và loader của router — để dữ liệu router tải sẵn nằm trong cùng cache */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Do not retry client errors (4xx); retry network and server errors once.
      retry: (failureCount, error) => !isClientError(error) && failureCount < 1,
    },
  },
})
