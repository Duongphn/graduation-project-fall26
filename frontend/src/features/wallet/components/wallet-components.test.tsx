import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { WalletTransaction } from '../wallet-api'
import { WalletBalanceCards } from './wallet-balance-cards'
import { WalletHistoryFilters } from './wallet-history-filters'
import { WalletTransactionList } from './wallet-transaction-list'

// Intl in Node can use a narrow no-break space; compare digits only.
const digits = (text: string | null) => (text ?? '').replace(/\D/g, '')

describe('WalletBalanceCards', () => {
  it('shows the available and held balances', () => {
    render(
      <WalletBalanceCards
        wallet={{
          balance: 650_000,
          availableBalance: 650_000,
          holdingBalance: 350_000,
          currency: 'VND',
        }}
      />,
    )

    const available = screen.getByRole('region', { name: 'Số dư khả dụng' })
    const holding = screen.getByRole('region', { name: 'Đang tạm giữ' })
    expect(digits(within(available).getByText(/650/).textContent)).toBe('650000')
    expect(digits(within(holding).getByText(/350/).textContent)).toBe('350000')
  })

  it('shows placeholders while loading', () => {
    render(<WalletBalanceCards wallet={undefined} />)
    expect(screen.getAllByText('…')).toHaveLength(2)
  })
})

describe('WalletTransactionList', () => {
  const transactions: WalletTransaction[] = [
    {
      id: 't1',
      amount: 500_000,
      type: 'credit',
      description: 'Nạp thử',
      reference: { kind: 'admin_credit', id: 'r1' },
      createdAt: '2026-11-13T01:00:00.000Z',
    },
    {
      id: 't2',
      amount: 350_000,
      type: 'debit',
      reference: { kind: 'rental_order', id: 'r2' },
      createdAt: '2026-11-13T02:00:00.000Z',
    },
    {
      id: 't3',
      amount: 200_000,
      type: 'credit',
      reference: { kind: 'payment', id: 'p1' },
      createdAt: '2026-11-13T03:00:00.000Z',
    },
  ]

  it('signs money in with + and money out with −, and labels the type', () => {
    render(<WalletTransactionList transactions={transactions} />)
    const [credit, debit, topup] = screen.getAllByRole('listitem')

    expect(within(credit).getByText('Nạp thử')).toBeInTheDocument()
    expect(within(credit).getByText('ToyFlow cộng tiền')).toBeInTheDocument()
    expect(within(credit).getByLabelText(/^Cộng/).textContent).toMatch(/^\+/)

    // No description: the type label is the title
    expect(within(debit).getAllByText('Thuê đồ chơi').length).toBeGreaterThan(0)
    expect(within(debit).getByLabelText(/^Trừ/).textContent).toMatch(/^−/)

    // VNPay top-ups are recorded with reference.kind "payment"
    expect(within(topup).getAllByText('Nạp tiền').length).toBeGreaterThan(0)
  })
})

describe('WalletHistoryFilters', () => {
  it('marks the active chips and reports the chosen filter', async () => {
    const onTypeChange = vi.fn()
    const onDirectionChange = vi.fn()
    render(
      <WalletHistoryFilters
        type="rental"
        direction={undefined}
        onTypeChange={onTypeChange}
        onDirectionChange={onDirectionChange}
      />,
    )

    const types = screen.getByRole('group', { name: 'Loại giao dịch' })
    expect(within(types).getByRole('button', { name: 'Thuê đồ chơi' })).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(within(types).getByRole('button', { name: 'Nạp tiền' }))
    expect(onTypeChange).toHaveBeenCalledWith('topup')

    await userEvent.click(within(types).getByRole('button', { name: 'Tất cả' }))
    expect(onTypeChange).toHaveBeenLastCalledWith(undefined)

    const directions = screen.getByRole('group', { name: 'Tiền vào hoặc tiền ra' })
    await userEvent.click(within(directions).getByRole('button', { name: 'Tiền ra' }))
    expect(onDirectionChange).toHaveBeenCalledWith('debit')
  })
})
