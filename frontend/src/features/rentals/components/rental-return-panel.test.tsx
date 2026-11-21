import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import type { RentalOrderDetail, RentalRulingSummary } from '../rental-orders-api'
import { RentalReturnRecord } from './rental-return-panel'
import { RentalSettlementRecord } from './rental-settle-panel'

// Review 20/11, rental bug 4: R 120.000 + D 150.000 = 270.000 held while disputing, not just the deposit.
const disputedOrder = {
  id: '64b000000000000000000041',
  status: 'DISPUTING',
  pricing: { days: 3, dailyRate: 40_000, rentalFee: 120_000, depositAmount: 150_000, platformFeeRate: 0.1, platformFee: 12_000, totalPayable: 270_000 },
  returnInfo: { photos: [], requestedAt: '2026-11-20T03:00:00Z', lateDays: 0, lateFee: 0 },
  settlement: { result: 'DAMAGED', evidencePhotos: [], description: 'Gãy càng trước.', settledAt: '2026-11-20T05:00:00Z' },
} as unknown as RentalOrderDetail

const ruling: RentalRulingSummary = {
  ruling: 'RENTER_AT_FAULT',
  compensationAmount: 75_000,
  rentRefundAmount: 0,
  ownerAmount: 183_000,
  renterAmount: 75_000,
  platformFee: 12_000,
  adminDecision: 'Ảnh lúc trả cho thấy càng xe bị gãy.',
  resolvedAt: '2026-11-24T05:00:00Z',
}
const resolvedOrder = {
  ...disputedOrder,
  status: 'COMPLETED',
  settlement: { ...disputedOrder.settlement!, resolution: ruling },
} as RentalOrderDetail

const returnBlock = () => screen.getByRole('region', { name: 'Trả đồ' })

describe('rental money while disputing and after the ruling', () => {
  it('says the whole held amount (rent + deposit) in the settlement block', () => {
    renderWithProviders(<RentalSettlementRecord order={disputedOrder} isOwner={false} />)
    expect(screen.getByText(/Tiền thuê và tiền cọc \(270\.000 ₫\) được ToyFlow/)).toBeInTheDocument()
  })

  it('does not promise a refund in the return block before the ruling', () => {
    renderWithProviders(<RentalReturnRecord order={disputedOrder} isOwner={false} />)
    expect(within(returnBlock()).queryByText('Hoàn lại cho bạn')).not.toBeInTheDocument()
    expect(within(returnBlock()).getByText('Cọc còn lại, chờ phán quyết')).toBeInTheDocument()
    expect(within(returnBlock()).getByText(/quản trị viên quyết định phần hoàn lại/)).toBeInTheDocument()
  })

  it('shows the ruled amounts in the return block after the ruling', () => {
    renderWithProviders(<RentalReturnRecord order={resolvedOrder} isOwner={false} />)
    const block = within(returnBlock())
    expect(block.getByText('Bồi thường cho chủ đồ (phán quyết)')).toBeInTheDocument()
    expect(block.getByText('−75.000 ₫')).toBeInTheDocument()
    const total = block.getByText('Hoàn lại cho bạn').parentElement!
    expect(within(total).getByText('75.000 ₫')).toBeInTheDocument()
    expect(block.queryByText('150.000 ₫', { selector: '.rental-money__total dd' })).not.toBeInTheDocument()
  })

  it('tells the owner what the renter got after the ruling', () => {
    renderWithProviders(<RentalReturnRecord order={resolvedOrder} isOwner />)
    const total = within(returnBlock()).getByText('Người thuê nhận').parentElement!
    expect(within(total).getByText('75.000 ₫')).toBeInTheDocument()
  })
})
