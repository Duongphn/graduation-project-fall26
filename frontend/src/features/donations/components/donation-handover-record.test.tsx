import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { DonationRequestDetail } from '../types'
import { DonationDeadline, DonationHandoverRecord } from './donation-handover-record'

const base: DonationRequestDetail = {
  id: '64b0000000000000000000d1',
  code: 'DNABC123',
  status: 'pending',
  receiverType: 'ORGANIZATION',
  message: null,
  deliveryMethod: 'shipping',
  decider: 'ADMIN',
  handoverMethod: null,
  carrierName: null,
  trackingCode: null,
  receipt: null,
  dueAt: null,
  toy: null,
  donor: null,
  requester: null,
  organization: {
    id: '64b0000000000000000000a1',
    name: 'Mái ấm Hoa Hồng',
    status: 'active',
    isAccepting: true,
    receivingPoint: null,
  },
  counterpartContact: null,
  decidedAt: null,
  rejectReason: null,
  completedAt: null,
  expiredAt: null,
  expiryReason: null,
  createdAt: '2026-11-10T00:00:00.000Z',
  updatedAt: '2026-11-10T00:00:00.000Z',
  decidedBy: null,
  handovers: [],
  cancellation: null,
  history: [],
}

const sent = {
  step: 'DONOR_SENT' as const,
  by: '64b0000000000000000000u1',
  photos: [],
  note: null,
  at: '2026-11-12T03:00:00.000Z',
}

describe('DonationDeadline (R03 III.5.2.2 (3))', () => {
  it('shows the decision deadline while Pending and the handover deadline while Accepted', () => {
    const { rerender } = render(<DonationDeadline request={{ ...base, dueAt: '2026-11-24T03:00:00.000Z' }} />)
    expect(screen.getByText(/Hạn quyết định:.*24\/11\/2026/)).toBeInTheDocument()
    rerender(
      <DonationDeadline request={{ ...base, status: 'accepted', dueAt: '2026-11-26T03:00:00.000Z' }} />,
    )
    expect(screen.getByText(/Hạn bàn giao:.*26\/11\/2026/)).toBeInTheDocument()
  })

  it('shows the sent date and the days waited while Shipping', () => {
    render(
      <DonationDeadline
        request={{ ...base, status: 'shipping', handovers: [sent] }}
        now={new Date('2026-11-15T04:00:00.000Z')}
      />,
    )
    expect(screen.getByText(/Đã gửi .*12\/11\/2026.*đã chờ 3 ngày/)).toBeInTheDocument()
  })
})

describe('DonationHandoverRecord (R03 III.5.2.2 (11), (12))', () => {
  it('shows the method, carrier and tracking code of the handover', () => {
    render(
      <DonationHandoverRecord
        request={{
          ...base,
          status: 'shipping',
          handoverMethod: 'carrier',
          carrierName: 'Giao Hàng Nhanh (GHN)',
          trackingCode: 'GHN123456',
          handovers: [sent],
        }}
      />,
    )
    expect(screen.getByText('Gửi qua đơn vị vận chuyển')).toBeInTheDocument()
    expect(screen.getByText('Giao Hàng Nhanh (GHN)')).toBeInTheDocument()
    expect(screen.getByText('GHN123456')).toBeInTheDocument()
    expect(screen.queryByText('Xác nhận đã nhận')).not.toBeInTheDocument()
  })

  it('shows who confirmed, the channel and the received date once Confirmed', () => {
    render(
      <DonationHandoverRecord
        request={{
          ...base,
          status: 'completed',
          handoverMethod: 'drop_off',
          handovers: [sent],
          completedAt: '2026-11-16T03:00:00.000Z',
          receipt: { confirmedBy: 'Cô Lan', channel: 'phone', receivedAt: '2026-11-14T17:00:00.000Z' },
        }}
      />,
    )
    expect(screen.getByText('Mang đến điểm nhận')).toBeInTheDocument()
    expect(screen.getByText('Cô Lan')).toBeInTheDocument()
    expect(screen.getByText('Điện thoại')).toBeInTheDocument()
    expect(screen.getByText('15/11/2026')).toBeInTheDocument()
  })

  it('shows nothing before the toy is sent', () => {
    const { container } = render(<DonationHandoverRecord request={{ ...base, status: 'accepted' }} />)
    expect(container).toBeEmptyDOMElement()
  })
})
