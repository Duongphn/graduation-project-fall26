import { afterEach, describe, expect, it, vi } from 'vitest'

import * as http from '../../services/http'
import { toPaginated, walletApi } from './wallet-api'
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
