import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { httpClient } from '../../../services/http-client'
import { renderWithProviders } from '../../../test/render'
import type { RentalDispute, RentalOrderDetail } from '../rental-orders-api'
import { RentalComplaintPanel } from './rental-complaint-panel'
import { RentalDisputePanel } from './rental-dispute-panel'

vi.mock('../../../services/http-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/http-client')>()),
  httpClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

const NOW = new Date('2026-11-05T20:00:00Z').getTime()

const inUse = {
  id: '64b000000000000000000051',
  status: 'IN_USE',
  rentalStartedAt: '2026-11-05T10:00:00Z',
} as unknown as RentalOrderDetail

const dispute: RentalDispute = {
  id: '64d000000000000000000001',
  code: 'DP261105AB12CD',
  status: 'open',
  reason: 'DAMAGED_ON_RECEIPT',
  description: 'Hộp bị móp, bánh xe trước bị gãy ngay khi mở ra.',
  claimant: 'renter',
  viewerRole: 'respondent',
  evidencePhotos: [],
  openedAt: '2026-11-05T20:00:00Z',
  replyDueAt: '2026-11-08T20:00:00Z',
  canRespond: true,
}

const answer = (data: RentalDispute) =>
  vi.mocked(httpClient.get).mockResolvedValue({ data: { success: true, data } } as never)

beforeEach(() => vi.mocked(httpClient.get).mockReset())

describe('RentalComplaintPanel (UC17)', () => {
  it('offers the renter a complaint within 24 hours of receipt', () => {
    renderWithProviders(<RentalComplaintPanel order={inUse} now={NOW} />)
    expect(screen.getByRole('heading', { name: 'Đồ chơi có vấn đề khi nhận?' })).toBeInTheDocument()
    expect(screen.getByText(/còn 14 giờ/)).toBeInTheDocument()
  })

  it('hides once the 24 hours have passed', () => {
    const later = new Date('2026-11-06T10:00:01Z').getTime()
    renderWithProviders(<RentalComplaintPanel order={inUse} now={later} />)
    expect(screen.queryByRole('heading', { name: 'Đồ chơi có vấn đề khi nhận?' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Gửi khiếu nại/ })).not.toBeInTheDocument()
  })
})

describe('RentalDisputePanel (UC18)', () => {
  it('shows the claim and a reply form to the respondent within the deadline', async () => {
    answer(dispute)
    renderWithProviders(<RentalDisputePanel orderId={inUse.id} now={NOW} />)

    expect(await screen.findByText('Người thuê khiếu nại · Hư hỏng khi nhận', { exact: false })).toBeInTheDocument()
    expect(screen.getByText(dispute.description)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Gửi phản hồi/ })).toBeInTheDocument()
    expect(screen.getByText('Chờ phản hồi')).toBeInTheDocument()
  })

  it('tells the claimant who is answering, without a form', async () => {
    answer({ ...dispute, viewerRole: 'claimant', canRespond: false })
    renderWithProviders(<RentalDisputePanel orderId={inUse.id} now={NOW} />)

    expect(await screen.findByText(/Đang chờ chủ đồ phản hồi trước/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Gửi phản hồi/ })).not.toBeInTheDocument()
  })

  it('shows the reply once sent and that the Admin is reviewing', async () => {
    answer({
      ...dispute,
      status: 'under_review',
      viewerRole: 'claimant',
      canRespond: false,
      response: { message: 'Lúc giao đồ còn nguyên, có ảnh đóng gói.', photos: [], respondedAt: '2026-11-06T02:00:00Z' },
    })
    renderWithProviders(<RentalDisputePanel orderId={inUse.id} now={NOW} />)

    expect(await screen.findByText('Lúc giao đồ còn nguyên, có ảnh đóng gói.')).toBeInTheDocument()
    expect(screen.getByText(/Phản hồi của chủ đồ/)).toBeInTheDocument()
    expect(screen.getByText(/đang xem xét ảnh và giải thích của cả hai bên/)).toBeInTheDocument()
  })
})
