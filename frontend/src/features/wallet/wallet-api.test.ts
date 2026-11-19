import { afterEach, describe, expect, it, vi } from 'vitest'

import * as http from '../../services/http'
import { toPaginated, toWalletSummary, walletApi } from './wallet-api'
import { walletTransactionsQuery } from './wallet-queries'

// Calls must match the lead's backend: paths, query names and the `data.items` list shape.
describe('wallet API calls', () => {
  afterEach(() => vi.restoreAllMocks())

  it('maps the history filters to `kind` (type of transaction) and `type` (direction)', async () => {
    const apiGet = vi.spyOn(http, 'apiGet').mockResolvedValue({
      items: [],
      total: 0,
      page: 2,
      limit: 10,
      totalPages: 1,
    })

    const query = walletTransactionsQuery({ type: 'topup', direction: 'credit', page: 2 })
    await query.queryFn!({} as never)

    expect(apiGet).toHaveBeenCalledWith('/wallets/me/transactions', {
      page: 2,
      limit: 10,
      type: 'credit',
      kind: 'payment',
    })
  })

  it('falls back to the balance when the backend leaves out the split balances', () => {
    expect(toWalletSummary({ balance: 300_000, currency: 'VND' })).toEqual({
      balance: 300_000,
      availableBalance: 300_000,
      holdingBalance: 0,
      currency: 'VND',
    })
    expect(
      toWalletSummary({ balance: 300_000, availableBalance: 300_000, holdingBalance: 50_000, currency: 'VND' }),
    ).toMatchObject({ holdingBalance: 50_000 })
  })

  it('turns the backend list into the shared pagination shape', () => {
    expect(toPaginated({ items: ['a'], total: 21, page: 2, limit: 10, totalPages: 3 })).toEqual({
      items: ['a'],
      pagination: { page: 2, limit: 10, totalItems: 21, totalPages: 3, hasNextPage: true, hasPrevPage: true },
    })
  })

  it('uses the lead’s top-up and return paths, keeping the raw VNPay query', async () => {
    const apiPost = vi.spyOn(http, 'apiPost').mockResolvedValue({})
    const apiGet = vi.spyOn(http, 'apiGet').mockResolvedValue({})

    await walletApi.createTopup(200_000)
    await walletApi.confirmVnpayReturn('?vnp_TxnRef=TOPUP1&vnp_SecureHash=abc')

    expect(apiPost).toHaveBeenCalledWith('/payments/topup/vnpay', { amount: 200_000 })
    expect(apiGet).toHaveBeenCalledWith('/payments/vnpay-return?vnp_TxnRef=TOPUP1&vnp_SecureHash=abc')
  })

  it('creates a PayOS top-up and asks the server about its order code', async () => {
    const apiPost = vi.spyOn(http, 'apiPost').mockResolvedValue({})
    const apiGet = vi.spyOn(http, 'apiGet').mockResolvedValue({})

    await walletApi.createPayosTopup(100_000)
    await walletApi.confirmPayosReturn('1763600000123')

    expect(apiPost).toHaveBeenCalledWith('/payments/topup/payos', { amount: 100_000 })
    expect(apiGet).toHaveBeenCalledWith('/payments/payos-return', { orderCode: '1763600000123' })
  })

  it('uses the lead’s withdrawal paths', async () => {
    const apiPost = vi.spyOn(http, 'apiPost').mockResolvedValue({})
    const apiGet = vi.spyOn(http, 'apiGet').mockResolvedValue({})
    const bankInfo = { bankName: 'BIDV', accountNumber: '123456', accountHolderName: 'TRAN B' }

    await walletApi.createWithdrawal({ amount: 100_000, bankInfo })
    await walletApi.myWithdrawals({ page: 1, limit: 5 })

    expect(apiPost).toHaveBeenCalledWith('/wallets/withdrawals', { amount: 100_000, bankInfo })
    expect(apiGet).toHaveBeenCalledWith('/wallets/withdrawals', { page: 1, limit: 5 })
  })
})
