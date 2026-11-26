import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type {
  AdminFinancialBreakdown,
  OwnerFinancialBreakdown,
  RenterFinancialBreakdown,
} from '../rental-orders-api'
import { RentalFinancialBreakdown } from './rental-financial-breakdown'

// Intl vi-VN puts a non-breaking space between the number and ₫
const vnd = (amount: number) => `${new Intl.NumberFormat('vi-VN').format(amount)} ₫`

/** The amount shown next to a label inside one money list */
const amountOf = (list: HTMLElement, label: string | RegExp) => {
  const term = within(list).getByText(label, { selector: 'dt' })
  return term.nextElementSibling?.textContent
}

const renterItems = { rentalFee: 60_000, depositPaid: 300_000, lateFee: 20_000, depositRefunded: 280_000, totalActualCost: 80_000 }
const ownerItems = { grossRentalFee: 60_000, platformFeeRate: 0.1, platformFee: 6_000, lateCompensation: 20_000, netEarnings: 74_000 }

const renter: RenterFinancialBreakdown = {
  role: 'renter',
  currency: 'VND',
  isEstimated: false,
  settlementStatus: 'SETTLED',
  items: renterItems,
  summary: { status: 'SETTLED', description: 'Đơn thuê đã quyết toán xong.' },
}

const owner: OwnerFinancialBreakdown = {
  role: 'owner',
  currency: 'VND',
  isEstimated: true,
  payoutStatus: 'ESCROW_HELD',
  items: ownerItems,
  summary: { status: 'ESCROW_HELD', description: 'Tiền thuê đang được ký quỹ.' },
}

const admin: AdminFinancialBreakdown = {
  role: 'admin',
  currency: 'VND',
  isEstimated: true,
  items: { ...renterItems, ...ownerItems, escrowBalance: 360_000, platformRevenue: 0 },
  renter,
  owner,
  platformRevenue: 0,
  summary: { status: 'IN_PROGRESS', description: 'Toàn cảnh tài chính đơn thuê đang trong tiến trình xử lý.' },
}

describe('RentalFinancialBreakdown', () => {
  it('shows the renter their real cost apart from the deposit, without platform fees', () => {
    render(<RentalFinancialBreakdown breakdown={renter} />)

    const costList = screen.getByLabelText('Chi phí người thuê')
    expect(amountOf(costList, 'Tiền thuê')).toBe(vnd(60_000))
    expect(amountOf(costList, 'Phí trả trễ')).toBe(`+${vnd(20_000)}`)
    expect(amountOf(costList, 'Tổng chi thực tế')).toBe(vnd(80_000))

    const deposit = screen.getByLabelText('Tiền cọc')
    expect(amountOf(deposit, 'Cọc đã trả')).toBe(vnd(300_000))
    expect(amountOf(deposit, 'Cọc hoàn lại')).toBe(vnd(280_000))

    expect(screen.queryByText(/Phí nền tảng/)).toBeNull()
    expect(screen.getByText('Đơn thuê đã quyết toán xong.')).toBeInTheDocument()
  })

  it('shows the owner the net earnings after the platform fee', () => {
    render(<RentalFinancialBreakdown breakdown={owner} />)

    const list = screen.getByLabelText('Thu nhập chủ đồ')
    expect(amountOf(list, 'Tiền thuê gộp')).toBe(vnd(60_000))
    expect(amountOf(list, 'Phí nền tảng 10%')).toBe(`−${vnd(6_000)}`)
    expect(amountOf(list, 'Bồi thường trả trễ')).toBe(`+${vnd(20_000)}`)
    expect(amountOf(list, 'Thực nhận')).toBe(vnd(74_000))
    expect(screen.queryByText('Cọc đã trả')).toBeNull()
  })

  it('shows the admin both sides plus the platform share and the escrow balance', () => {
    render(<RentalFinancialBreakdown breakdown={admin} />)

    expect(screen.getByRole('heading', { name: 'Người thuê' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Chủ đồ' })).toBeInTheDocument()
    expect(amountOf(screen.getByLabelText('Chi phí người thuê'), 'Tổng chi thực tế')).toBe(vnd(80_000))
    expect(amountOf(screen.getByLabelText('Thu nhập chủ đồ'), 'Thực nhận')).toBe(vnd(74_000))

    const platform = screen.getByLabelText('Nền tảng')
    expect(amountOf(platform, 'Doanh thu nền tảng')).toBe(vnd(0))
    expect(amountOf(platform, 'Số dư ký quỹ')).toBe(vnd(360_000))
  })

  it('labels the numbers "Tạm tính" only while the order is still in progress', () => {
    const { rerender } = render(<RentalFinancialBreakdown breakdown={owner} />)
    expect(screen.getByText('Tạm tính')).toBeInTheDocument()

    rerender(<RentalFinancialBreakdown breakdown={renter} />)
    expect(screen.queryByText('Tạm tính')).toBeNull()
  })
})
