import { screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import type { PublicOrganization } from '../types'
import { OrganizationProfile } from './organization-profile'

const organization: PublicOrganization = {
  id: 'o1',
  name: 'Mái ấm Hoa Sen',
  address: '12 Hàng Bài, Hà Nội',
  supportCriteria: 'Mái ấm nuôi dưỡng 40 trẻ.',
  ageGroups: [{ minAge: 3, maxAge: 6 }],
  categoryIds: [],
  areaProvince: 'Hà Nội',
  isRemoteArea: false,
  isAccepting: true,
  receivingPoint: {
    province: 'Hà Nội',
    ward: 'Phường Hoàn Kiếm',
    street: '12 Hàng Bài',
    openingHours: '8:00–17:00 thứ 2–6',
    acceptsDropOff: true,
    acceptsParcel: false,
  },
} as PublicOrganization

// GB-62: the receiving point's address and opening hours are public.
describe('OrganizationProfile', () => {
  it('shows the receiving point with its opening hours and methods', () => {
    renderWithProviders(
      <MemoryRouter>
        <OrganizationProfile organization={organization} />
      </MemoryRouter>,
    )
    expect(screen.getByText('12 Hàng Bài, Phường Hoàn Kiếm, Hà Nội')).toBeInTheDocument()
    expect(screen.getByText('8:00–17:00 thứ 2–6')).toBeInTheDocument()
    expect(screen.getByText('Nhận đồ mang đến')).toBeInTheDocument()
    expect(screen.queryByText('Người phụ trách & liên hệ')).not.toBeInTheDocument()
  })
})
