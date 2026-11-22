import { screen } from '@testing-library/react'
import { afterAll, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import type { DisputeDetail } from '../types'
import { DisputeCaseCard } from './DisputeCasePanels'

// DEF-ST-55 (R03 IV.1.1): dd/MM/yyyy and Vietnam time on a device in New York (UTC−5).
// The time zone is set before the modules load.
const previousTz = vi.hoisted(() => {
  const previous = process.env.TZ
  process.env.TZ = 'America/New_York'
  return previous
})

afterAll(() => {
  if (previousTz === undefined) delete process.env.TZ
  else process.env.TZ = previousTz
})

const dispute = {
  id: '64b000000000000000000021',
  code: 'DP261122ABCDEF',
  status: 'resolved',
  reason: 'DAMAGED_ON_RETURN',
  claimant: 'owner',
  // 13:42 UTC = 20:42 in Vietnam = 08:42 in New York
  openedAt: '2026-11-22T13:42:00.000Z',
  replyDueAt: '2026-11-25T13:42:00.000Z',
  frozenAmount: 350_000,
  description: 'Đồ chơi bị gãy càng trước.',
  order: { id: '64b000000000000000000031', code: 'RO261120ABCDEF', status: 'DISPUTING' },
  toy: { id: '64b000000000000000000041', title: 'Xe cần cẩu' },
  owner: { id: '64b000000000000000000051', fullName: 'Chủ Đồ' },
  renter: { id: '64b000000000000000000061', fullName: 'Người Thuê', trustScore: 80 },
  rentalOrder: {
    period: { startDate: '2026-11-23', endDate: '2026-11-25' },
    pricing: { days: 3, dailyRate: 50_000, rentalFee: 150_000, depositAmount: 200_000, platformFeeRate: 0.1, platformFee: 15_000, totalPayable: 350_000 },
  },
  history: [],
} as unknown as DisputeDetail

describe('DisputeCaseCard on a device in New York', () => {
  it('shows the rental period as dd/mm/yyyy and the times in Vietnam time', () => {
    renderWithProviders(<DisputeCaseCard dispute={dispute} />)

    expect(screen.getByText(/RO261120ABCDEF · 23\/11\/2026 → 25\/11\/2026/)).toBeInTheDocument()
    expect(screen.queryByText(/2026-11-23/)).not.toBeInTheDocument()
    expect(screen.getByText(/20:42 22\/11\/2026/)).toBeInTheDocument()
    expect(screen.getByText('20:42 25/11/2026')).toBeInTheDocument()
  })
})
