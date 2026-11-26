import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { DonationRequestDetail } from '../types'
import { DonationTimeline } from './DonationTimeline'

const DONOR = '64b0000000000000000000u1'
const RECEIVER = '64b0000000000000000000u2'
const ADMIN = '64b0000000000000000000u3'

const request = {
  id: '64b0000000000000000000d1',
  code: 'DNABC123',
  status: 'expired',
  receiverType: 'USER',
  donor: { id: DONOR, fullName: 'Trần Thị Tặng', avatarUrl: null },
  requester: { id: RECEIVER, fullName: 'Lê Văn Nhận', avatarUrl: null },
  organization: null,
  handovers: [],
  history: [
    { fromStatus: null, toStatus: 'pending', actorType: 'USER', actorId: RECEIVER, reason: null, at: '2026-11-10T00:00:00.000Z' },
    { fromStatus: 'pending', toStatus: 'accepted', actorType: 'USER', actorId: DONOR, reason: null, at: '2026-11-11T00:00:00.000Z' },
    { fromStatus: 'accepted', toStatus: 'cancelled', actorType: 'ADMIN', actorId: ADMIN, reason: 'Thất lạc', at: '2026-11-12T00:00:00.000Z' },
    { fromStatus: 'accepted', toStatus: 'expired', actorType: 'SYSTEM', actorId: null, reason: null, at: '2026-11-13T00:00:00.000Z' },
  ],
} as unknown as DonationRequestDetail

// GB-19, R03 III.5.2.2 (2): each change shows who made it by role, not a generic "Người dùng".
describe('DonationTimeline', () => {
  it('names the actor of each status change by role', () => {
    render(<DonationTimeline request={request} />)
    expect(screen.getByText('Người nhận · Lê Văn Nhận')).toBeInTheDocument()
    expect(screen.getByText('Người tặng · Trần Thị Tặng')).toBeInTheDocument()
    expect(screen.getByText('Quản trị viên')).toBeInTheDocument()
    expect(screen.getByText('Hệ thống')).toBeInTheDocument()
    expect(screen.queryByText('Người dùng')).not.toBeInTheDocument()
  })
})
