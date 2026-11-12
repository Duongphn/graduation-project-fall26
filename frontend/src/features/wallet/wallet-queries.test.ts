import { describe, expect, it } from 'vitest'

import { parseWalletHistorySearch, toWalletHistorySearch, walletKeys } from './wallet-queries'

describe('wallet history URL filters', () => {
  it('reads type, direction and page from the URL', () => {
    expect(parseWalletHistorySearch(new URLSearchParams('type=rental&direction=debit&page=3'))).toEqual({
      type: 'rental',
      direction: 'debit',
      page: 3,
    })
  })

  it('drops unknown values and bad pages', () => {
    expect(parseWalletHistorySearch(new URLSearchParams('type=gift&direction=up&page=-2'))).toEqual({
      type: undefined,
      direction: undefined,
      page: 1,
    })
    expect(parseWalletHistorySearch(new URLSearchParams('page=1.5'))).toMatchObject({ page: 1 })
  })

  it('writes only the filters that are set (page 1 is the default)', () => {
    expect(toWalletHistorySearch({ type: 'topup', page: 1 }).toString()).toBe('type=topup')
    expect(toWalletHistorySearch({ direction: 'credit', page: 2 }).toString()).toBe('direction=credit&page=2')
    expect(toWalletHistorySearch({ page: 1 }).toString()).toBe('')
  })

  it('keeps the history keys under the balance key so one invalidation refreshes both', () => {
    expect(walletKeys.transactions({ page: 1 }).slice(0, walletKeys.me.length)).toEqual([...walletKeys.me])
  })
})
