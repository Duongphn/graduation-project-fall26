import { afterEach, describe, expect, it } from 'vitest'

import {
  clearTopupReturn,
  isSafeReturnPath,
  parseTopupRequest,
  readTopupReturn,
  rememberTopupReturn,
  suggestedTopupAmount,
  topupAmountError,
  walletTopupLink,
} from './topup-session'

describe('top-up helpers', () => {
  afterEach(() => sessionStorage.clear())

  it('only accepts in-app return paths', () => {
    expect(isSafeReturnPath('/rentals/mine/123')).toBe(true)
    expect(isSafeReturnPath('//evil.com')).toBe(false)
    expect(isSafeReturnPath('https://evil.com')).toBe(false)
    expect(isSafeReturnPath('/\\evil.com')).toBe(false)
    expect(isSafeReturnPath(null)).toBe(false)
  })

  it('remembers and clears the page to come back to', () => {
    rememberTopupReturn('/rentals/mine/1')
    expect(readTopupReturn()).toBe('/rentals/mine/1')
    clearTopupReturn()
    expect(readTopupReturn()).toBeUndefined()

    rememberTopupReturn('//evil.com')
    expect(readTopupReturn()).toBeUndefined()
  })

  it('suggests the shortfall rounded up to a thousand, within the limits', () => {
    expect(suggestedTopupAmount(123_456)).toBe(124_000)
    expect(suggestedTopupAmount(3_000)).toBe(10_000)
    expect(suggestedTopupAmount(150_000_000)).toBe(100_000_000)
  })

  it('builds and reads the wallet link that opens the top-up dialog', () => {
    const link = walletTopupLink('/wallet', 124_000, '/rentals/mine/1')
    expect(link).toBe('/wallet?topup=124000&returnTo=%2Frentals%2Fmine%2F1')

    const params = new URLSearchParams(link.split('?')[1])
    expect(parseTopupRequest(params)).toEqual({ amount: 124_000, returnTo: '/rentals/mine/1' })
    expect(parseTopupRequest(new URLSearchParams('topup=5&returnTo=//x'))).toEqual({
      amount: undefined,
      returnTo: undefined,
    })
    expect(parseTopupRequest(new URLSearchParams('type=rental'))).toBeUndefined()
  })

  it('validates the amount against the limits', () => {
    expect(topupAmountError(undefined)).toMatch(/nhập số tiền/)
    expect(topupAmountError(9_999)).toMatch(/tối thiểu/)
    expect(topupAmountError(100_000_001)).toMatch(/tối đa/)
    expect(topupAmountError(200_000)).toBeUndefined()
  })
})
