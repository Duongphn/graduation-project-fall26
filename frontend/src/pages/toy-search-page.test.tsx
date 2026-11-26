import { screen } from '@testing-library/react'
import { AxiosError, AxiosHeaders } from 'axios'
import type { ReactNode } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { categoriesQuery } from '../features/toy-listings/toy-listing-queries'
import { PATHS } from '../routes/paths'
import { httpClient } from '../services/http-client'
import { createTestQueryClient, renderWithProviders } from '../test/render'
import { ToySearchPage } from './toy-search-page'

// No network: the axios instance is replaced; each test decides what the server answers.
vi.mock('../services/http-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/http-client')>()),
  httpClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
vi.mock('../layouts/site/site-layout', () => ({
  SiteLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
vi.mock('../features/ai-chat/components/advisor-floating-chat', () => ({
  AdvisorFloatingChat: () => null,
}))

const get = vi.mocked(httpClient.get)

const serverError = (status: number, message: string) =>
  new AxiosError('failed', 'ERR_BAD_RESPONSE', undefined, undefined, {
    status,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: { success: false, error: { code: 'SEARCH_EXECUTION_ERROR', message } },
  })

const renderPage = () => {
  const queryClient = createTestQueryClient()
  queryClient.setQueryData(categoriesQuery.queryKey, [])
  const router = createMemoryRouter([{ path: PATHS.toys, element: <ToySearchPage /> }], {
    initialEntries: [PATHS.toys],
  })
  renderWithProviders(<RouterProvider router={router} />, queryClient)
}

// E2E 26/11 #13: a failed search shows a friendly Vietnamese error, not the driver message.
describe('ToySearchPage when the search fails', () => {
  beforeEach(() => {
    get.mockReset()
  })

  it('shows a Vietnamese error state and stops saying "Đang tìm…" on a 500', async () => {
    get.mockRejectedValue(serverError(500, 'Search operation failed: Using $search and $vectorSearch requires Atlas'))
    renderPage()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Chưa tải được danh sách.')
    expect(alert).toHaveTextContent('Hệ thống tìm kiếm đang gặp sự cố. Bạn thử lại sau ít phút nhé.')
    expect(screen.queryByText(/\$search|Atlas/)).not.toBeInTheDocument()
    expect(screen.queryByText('Đang tìm…')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Chưa tải được kết quả' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument()
  })

  it('keeps the server message of a 4xx error', async () => {
    get.mockRejectedValue(serverError(400, 'Khoảng giá không hợp lệ.'))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('Khoảng giá không hợp lệ.')
  })
})
