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

  // GB-53, R03 III.5.2.3 (6): what the organization accepts, and the "Remote area" badge.
  it('shows the accepted age groups and categories, the area served and the remote-area badge', () => {
    renderWithProviders(
      <MemoryRouter>
        <OrganizationProfile
          organization={{
            ...organization,
            ageGroups: [
              { minAge: 3, maxAge: 6 },
              { minAge: 6, maxAge: 12 },
            ],
            categoryIds: ['c1', 'c2', 'hidden'],
            areaProvince: 'Lào Cai',
            isRemoteArea: true,
          }}
          categoryNames={
            new Map([
              ['c1', 'Gấu bông'],
              ['c2', 'Đồ chơi gỗ'],
            ])
          }
        />
      </MemoryRouter>,
    )
    expect(screen.getByText('3–6 tuổi')).toBeInTheDocument()
    expect(screen.getByText('6–12 tuổi')).toBeInTheDocument()
    expect(screen.getByText('Gấu bông')).toBeInTheDocument()
    expect(screen.getByText('Đồ chơi gỗ')).toBeInTheDocument()
    expect(screen.getByText('Lào Cai')).toBeInTheDocument()
    expect(screen.getByText('Vùng khó khăn')).toBeInTheDocument()
  })
})
