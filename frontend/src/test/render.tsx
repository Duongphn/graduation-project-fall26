import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, renderHook } from '@testing-library/react'
import { App } from 'antd'
import type { ReactElement, ReactNode } from 'react'

// Fresh query client per test: no retries (an error is final) and no cache shared between tests.
export const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

// The providers every feature component needs: React Query and antd's App (message, modal).
export const createWrapper = (queryClient = createTestQueryClient()) =>
  function TestProviders({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <App>{children}</App>
      </QueryClientProvider>
    )
  }

export const renderWithProviders = (ui: ReactElement, queryClient = createTestQueryClient()) => ({
  queryClient,
  ...render(ui, { wrapper: createWrapper(queryClient) }),
})

export const renderHookWithProviders = <T,>(
  hook: () => T,
  queryClient = createTestQueryClient(),
) => ({
  queryClient,
  ...renderHook(hook, { wrapper: createWrapper(queryClient) }),
})

// A promise resolved or rejected from the test, to hold a request "in flight".
export const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
