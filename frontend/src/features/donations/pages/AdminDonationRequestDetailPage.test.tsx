import { screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import { donationRequestsApi } from '../api'
import type { DonationRequestDetail } from '../types'
import { AdminDonationRequestDetailPage } from './AdminDonationRequestDetailPage'

// No network: the admin api module is replaced; each test decides what the server answers.
vi.mock('../api', () => ({
  donationRequestsApi: { detail: vi.fn() },
}))

const detail = vi.mocked(donationRequestsApi.detail)

const base: DonationRequestDetail = {
  id: '64b0000000000000000000d1',
  code: 'DNABC123',
  status: 'shipping',
  receiverType: 'ORGANIZATION',
  message: null,
  deliveryMethod: 'shipping',
  decider: 'ADMIN',
  handoverMethod: 'drop_off',
  carrierName: null,
  trackingCode: null,
  receipt: null,
  dueAt: null,
  toy: {
    id: '64b0000000000000000000c1',
    title: 'Bộ tàu hỏa gỗ',
    imageUrl: null,
    condition: 'good',
    ageRange: { minAge: 3, maxAge: 6 },
    status: 'hidden',
  },
  donor: null,
  requester: null,
  organization: {
    id: '64b0000000000000000000a1',
    name: 'Mái ấm Hoa Hồng',
    status: 'active',
    isAccepting: true,
    receivingPoint: null,
  },
  counterpartContact: null,
  decidedAt: null,
  rejectReason: null,
  completedAt: null,
  expiredAt: null,
  expiryReason: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  decidedBy: null,
  handovers: [],
  cancellation: null,
  history: [],
}

const renderPage = () => {
  const router = createMemoryRouter(
    [{ path: '/admin/donation-requests/:id', element: <AdminDonationRequestDetailPage /> }],
    { initialEntries: [`/admin/donation-requests/${base.id}`] },
  )
  renderWithProviders(<RouterProvider router={router} />)
}

beforeEach(() => detail.mockReset())

describe('AdminDonationRequestDetailPage', () => {
  it('shows the toy of a confirmed request as donated (GB-60)', async () => {
    detail.mockResolvedValue({ ...base, status: 'completed', toy: { ...base.toy!, status: 'donated' } })
    renderPage()

    expect(await screen.findByText('Đã quyên góp')).toBeInTheDocument()
  })

  it('keeps the stored status of a toy that was not donated', async () => {
    detail.mockResolvedValue({ ...base, status: 'cancelled' })
    renderPage()

    expect(await screen.findByText('Bộ tàu hỏa gỗ')).toBeInTheDocument()
    expect(screen.queryByText('Đã quyên góp')).not.toBeInTheDocument()
  })
})
