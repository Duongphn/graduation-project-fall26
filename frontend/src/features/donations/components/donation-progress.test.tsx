import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { donationStatuses } from '../../../constants/domain'
import { getStatusStyle, statusOptions } from '../../../styles/status'
import type { DonationRequestDetail } from '../types'
import { DonationProgress } from './donation-progress'

const EXPIRY_REASON = 'Yêu cầu đã hết hạn vì không được chấp nhận kịp thời.'

const expired: DonationRequestDetail = {
  id: '64b0000000000000000000d2',
  code: 'DNEXP0001',
  status: 'expired',
  receiverType: 'USER',
  message: null,
  deliveryMethod: 'shipping',
  decider: 'DONOR',
  handoverMethod: null,
  carrierName: null,
  trackingCode: null,
  receipt: null,
  dueAt: null,
  toy: null,
  donor: null,
  requester: null,
  organization: null,
  counterpartContact: null,
  decidedAt: null,
  rejectReason: null,
  completedAt: null,
  expiredAt: '2026-11-18T03:00:00.000Z',
  expiryReason: EXPIRY_REASON,
  createdAt: '2026-11-04T03:00:00.000Z',
  updatedAt: '2026-11-18T03:00:00.000Z',
  decidedBy: null,
  handovers: [],
  cancellation: null,
  history: [],
}

// GB-57 / R04 3.9: an expired request has its own status, label and reason, not "Đã huỷ".
describe('expired donation request', () => {
  it('has its own label and status tab', () => {
    expect(donationStatuses).toContain('expired')
    expect(getStatusStyle('donation', 'expired').label).toBe('Đã hết hạn')
    expect(statusOptions('donation').map((option) => option.value)).toContain('expired')
  })

  it('shows the expiry and its reason instead of the four steps', () => {
    render(<DonationProgress request={expired} />)
    expect(screen.getByText(/Phiếu quyên góp đã hết hạn/)).toBeInTheDocument()
    expect(screen.getByText(EXPIRY_REASON)).toBeInTheDocument()
    expect(screen.queryByText(/đã huỷ/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('words it for the receiver', () => {
    render(<DonationProgress request={expired} perspective="receiver" />)
    expect(screen.getByText(/Yêu cầu nhận đã hết hạn/)).toBeInTheDocument()
  })
})
