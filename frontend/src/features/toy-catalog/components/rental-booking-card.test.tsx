import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, AxiosHeaders } from 'axios'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { profileQuery } from '../../profile/profile-queries'
import { httpClient } from '../../../services/http-client'
import { createTestQueryClient, renderWithProviders } from '../../../test/render'
import type { ToyDetail } from '../toy-catalog-api'
import { RentalBookingCard } from './rental-booking-card'

vi.mock('../../../services/http-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/http-client')>()),
  httpClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))
vi.mock('../../../hooks/use-is-signed-in', () => ({ useIsSignedIn: () => true }))

const get = vi.mocked(httpClient.get)
const post = vi.mocked(httpClient.post)

const toy = {
  id: '64c000000000000000000001',
  title: 'Xe cẩu',
  listingType: 'rent',
  priceOrRate: 45_000,
  depositPrice: 200_000,
  owner: { id: '64a000000000000000000001', displayName: 'Chủ đồ' },
} as unknown as ToyDetail

const pricing = { days: 2, dailyRate: 45_000, rentalFee: 90_000, depositAmount: 200_000, platformFeeRate: 0.1, platformFee: 9_000, totalPayable: 290_000 }

const conflict = new AxiosError('conflict', 'ERR_BAD_REQUEST', undefined, undefined, {
  status: 409,
  statusText: '',
  headers: {},
  config: { headers: new AxiosHeaders() },
  data: {
    success: false,
    error: {
      code: 'RENTAL_DATES_UNAVAILABLE',
      message: 'Khoảng thời gian đã có người đặt thuê.',
      details: {
        conflicts: [{ startDate: '2026-11-28', endDate: '2026-11-29' }],
        suggestion: { startDate: '2026-11-30', endDate: '2026-12-01' },
      },
    },
  },
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-20T03:00:00Z'))
  get.mockReset()
  post.mockReset()
  get.mockResolvedValue({ data: { periods: [] } })
  let quotes = 0
  post.mockImplementation(async (url) => {
    if (url === '/rentals/quote') {
      quotes += 1
      // After the 409 the quote is refetched and now says the dates are taken
      return { data: { success: true, data: { available: quotes === 1, pricing, conflicts: [] } } }
    }
    throw conflict
  })
})

afterEach(() => vi.useRealTimers())

// Review 20/11, rental bug 8: after a 409 the card showed two error boxes.
describe('RentalBookingCard after overlapping dates (409)', () => {
  it('shows one error with the suggested free range', async () => {
    const queryClient = createTestQueryClient()
    queryClient.setQueryData(profileQuery.queryKey, { id: '64a000000000000000000009' } as never)
    renderWithProviders(
      <MemoryRouter>
        <RentalBookingCard toy={toy} />
      </MemoryRouter>,
      queryClient,
    )
    const user = userEvent.setup()
    const first = await screen.findByRole('button', { name: /28.11: còn trống/ })
    await vi.waitFor(() => expect(first).toBeEnabled())
    await user.click(first)
    await user.click(screen.getByRole('button', { name: /29\/11: còn trống/ }))
    const submit = screen.getByRole('button', { name: 'Gửi yêu cầu thuê' })
    await vi.waitFor(() => expect(submit).toBeEnabled())
    await user.click(submit)

    const suggestion = await screen.findByRole('button', { name: /Chọn khoảng trống gần nhất: 30.11 → 01.12/ })
    await vi.waitFor(() => expect(post.mock.calls.filter(([url]) => url === '/rentals/quote')).toHaveLength(2))
    expect(await screen.findAllByRole('alert')).toHaveLength(1)
    expect(screen.getByText('Khoảng thời gian đã có người đặt thuê.')).toBeInTheDocument()
    expect(screen.queryByText(/vừa có người đặt/)).not.toBeInTheDocument()
    expect(suggestion).toBeInTheDocument()
  })
})
