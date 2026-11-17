import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import { donationRequestsApi } from '../api'
import type { DonationRequestDetail } from '../types'
import { DonationActions } from './DonationActions'

// No network: the admin api module is replaced; each test decides what the server answers.
vi.mock('../api', () => ({
  donationRequestsApi: {
    accept: vi.fn(),
    reject: vi.fn(),
    cancel: vi.fn(),
    confirmReceived: vi.fn(),
  },
}))

const api = vi.mocked(donationRequestsApi)

const base: DonationRequestDetail = {
  id: '64b0000000000000000000d1',
  code: 'DNABC123',
  status: 'pending',
  receiverType: 'ORGANIZATION',
  message: null,
  deliveryMethod: 'shipping',
  decider: 'ADMIN',
  handoverMethod: null,
  carrierName: null,
  trackingCode: null,
  receipt: null,
  dueAt: null,
  toy: null,
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
  createdAt: '2026-11-10T00:00:00.000Z',
  updatedAt: '2026-11-10T00:00:00.000Z',
  decidedBy: null,
  handovers: [],
  cancellation: null,
  history: [],
}

const renderActions = (request: Partial<DonationRequestDetail> = {}) => {
  renderWithProviders(<DonationActions request={{ ...base, ...request }} />)
  return userEvent.setup()
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('DonationActions (Admin)', () => {
  it('lets the Admin accept a request a Donor sent to an organization (GB-56)', async () => {
    api.accept.mockResolvedValue({ ...base, status: 'accepted' })
    const user = renderActions()

    await user.click(screen.getByRole('button', { name: 'Chấp nhận' }))
    const confirm = await screen.findByRole('tooltip')
    await user.click(within(confirm).getByRole('button', { name: 'Chấp nhận' }))

    await waitFor(() => expect(api.accept).toHaveBeenCalledWith(base.id))
    expect(screen.getByRole('button', { name: 'Từ chối' })).toBeInTheDocument()
  })

  it('shows no decision buttons on a request the Donor decides', () => {
    renderActions({ decider: 'DONOR' })
    expect(screen.queryByRole('button', { name: 'Chấp nhận' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Từ chối' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Huỷ yêu cầu' })).toBeInTheDocument()
  })

  it('disables accept while the organization is hidden', () => {
    renderActions({ organization: { ...base.organization!, status: 'hidden' } })
    expect(screen.getByRole('button', { name: 'Chấp nhận' })).toBeDisabled()
  })

  it("asks for the organization's receipt details and a photo before confirming (GB-59)", async () => {
    const user = renderActions({ status: 'shipping' })

    await user.click(screen.getByRole('button', { name: 'Xác nhận đã nhận' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Kênh xác nhận')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: /Xác nhận đã nhận/ }))

    expect(await within(dialog).findByText('Vui lòng tải lên ít nhất một ảnh nhận hàng.')).toBeInTheDocument()
    expect(within(dialog).getByText('Chọn kênh xác nhận.')).toBeInTheDocument()
    expect(within(dialog).getByText('Chọn ngày nhận.')).toBeInTheDocument()
    expect(api.confirmReceived).not.toHaveBeenCalled()
  })

  it('keeps the reason form for a USER receiver', async () => {
    const user = renderActions({ status: 'shipping', receiverType: 'USER', organization: null, decider: 'DONOR' })

    await user.click(screen.getByRole('button', { name: 'Xác nhận đã nhận' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Lý do Admin xác nhận thay bên nhận')).toBeInTheDocument()
    expect(within(dialog).queryByText('Kênh xác nhận')).not.toBeInTheDocument()
  })
})
