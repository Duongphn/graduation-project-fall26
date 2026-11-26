import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import type { RentalOrderDetail } from '../rental-orders-api'
import { RentalSettlementRecord } from './rental-settle-panel'

// A disputed order after the Admin's ruling (UC19, R03 example 1b).
const resolvedOrder = {
  id: '64b000000000000000000031',
  status: 'COMPLETED',
  pricing: { days: 3, dailyRate: 50_000, rentalFee: 150_000, depositAmount: 200_000, platformFeeRate: 0.1, platformFee: 15_000, totalPayable: 350_000 },
  settlement: {
    result: 'DAMAGED',
    evidencePhotos: [],
    description: 'Gãy càng trước.',
    settledAt: '2026-11-07T10:00:00Z',
    resolution: {
      ruling: 'RENTER_AT_FAULT',
      compensationAmount: 50_000,
      rentRefundAmount: 0,
      ownerAmount: 185_000,
      renterAmount: 150_000,
      platformFee: 15_000,
      adminDecision: 'Ảnh lúc trả cho thấy càng xe bị gãy, ảnh lúc nhận thì còn nguyên vẹn.',
      resolvedAt: '2026-11-10T10:00:00Z',
    },
  },
} as unknown as RentalOrderDetail

describe('RentalSettlementRecord after a dispute ruling', () => {
  it('shows the ruling and what the renter got back instead of "đang khiếu nại"', () => {
    renderWithProviders(<RentalSettlementRecord order={resolvedOrder} isOwner={false} />)
    expect(screen.getByText('Quản trị viên đã giải quyết khiếu nại hư hỏng')).toBeInTheDocument()
    expect(screen.getByText('Người thuê có lỗi')).toBeInTheDocument()
    expect(screen.getByText('Hoàn lại cho bạn')).toBeInTheDocument()
    expect(screen.getByText('150.000 ₫')).toBeInTheDocument()
    expect(screen.getByText('50.000 ₫')).toBeInTheDocument()
    expect(screen.queryByText(/đang khiếu nại/)).not.toBeInTheDocument()
  })
})
