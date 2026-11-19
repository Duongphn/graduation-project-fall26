import { screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import type { DonationRequestDetail } from '../types'
import { DonationReceiverCard } from './donation-receiver-card'

const request = {
  id: 'r1',
  status: 'accepted',
  receiverType: 'ORGANIZATION',
  organization: {
    id: '',
    name: 'Mái ấm Hoa Sen',
    status: 'active',
    receivingPoint: {
      province: 'Hà Nội',
      ward: 'Phường Hoàn Kiếm',
      street: '12 Hàng Bài',
      openingHours: '8:00–17:00 thứ 2–6',
      acceptsDropOff: true,
      acceptsParcel: true,
    },
  },
  requester: null,
  counterpartContact: { name: 'Cô Lan', phone: '0912000111' },
} as unknown as DonationRequestDetail

// GB-62: while Accepted or Shipping the Donor sees the receiving point's contact name and phone.
describe('DonationReceiverCard', () => {
  it('shows the receiving point and its contact person to the Donor', () => {
    renderWithProviders(
      <MemoryRouter>
        <DonationReceiverCard request={request} />
      </MemoryRouter>,
    )
    expect(screen.getByText('12 Hàng Bài, Phường Hoàn Kiếm, Hà Nội')).toBeInTheDocument()
    expect(screen.getByText('Giờ nhận: 8:00–17:00 thứ 2–6')).toBeInTheDocument()
    expect(screen.getByText('Cô Lan')).toBeInTheDocument()
    expect(screen.getByText('0912000111')).toBeInTheDocument()
  })
})
