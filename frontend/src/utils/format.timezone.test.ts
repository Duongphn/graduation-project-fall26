import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// R05 TC-USA-009: dates and times are shown in Vietnam time (UTC+7) whatever the device time zone.
// The device is set to New York before the formatters are loaded.
const previousTz = process.env.TZ

beforeAll(() => {
  process.env.TZ = 'America/New_York'
  vi.resetModules()
})

afterAll(() => {
  process.env.TZ = previousTz
})

describe('Vietnam time on a device in New York (TC-USA-009)', () => {
  const paidAt = '2026-11-18T08:56:08.000Z' // 15:56 in Vietnam, 03:56 in New York

  it('runs with the New York time zone', () => {
    expect(new Date(paidAt).getHours()).toBe(3)
  })

  it('formats a moment in UTC+7', async () => {
    const { formatDateTime } = await import('./format')
    const donations = await import('../features/donations/format')
    expect(formatDateTime(paidAt)).toBe('15:56 18/11/2026')
    expect(donations.formatDateTime(paidAt)).toContain('15:56')
  })

  it('keeps the Vietnamese calendar day near midnight', async () => {
    const { formatDate } = await import('./format')
    const { formatFullDate } = await import('../features/rentals/rental-display')
    // 20/11 23:30 UTC is already 21/11 06:30 in Vietnam
    expect(formatDate('2026-11-20T23:30:00.000Z')).toBe('21/11/2026')
    expect(formatFullDate('2026-11-20T23:30:00.000Z')).toBe('21/11/2026')
  })

  // DEF-ST-55: the wallet history and withdrawals show Vietnam time, not the device time.
  it('shows wallet times in UTC+7', async () => {
    const { formatTransactionTime } = await import('../features/wallet/wallet-display')
    // 13:42 UTC = 20:42 in Vietnam = 08:42 in New York
    expect(formatTransactionTime('2026-11-22T13:42:00.000Z')).toBe('20:42 22/11/2026')
  })

  // DEF-ST-55: a plain calendar day (a rental period) is that day in Vietnam, east or west of it.
  it('keeps a plain calendar day', async () => {
    const { formatDate } = await import('./format')
    expect(formatDate('2026-11-23')).toBe('23/11/2026')
    process.env.TZ = 'Asia/Tokyo'
    try {
      expect(formatDate('2026-11-23')).toBe('23/11/2026')
    } finally {
      process.env.TZ = 'America/New_York'
    }
  })
})
