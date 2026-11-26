import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import type { Organization } from '../types'
import { OrganizationDetails } from './OrganizationDetails'

const organization: Organization = {
  id: '64b0000000000000000000aa',
  name: 'Mái ấm Hoa Hồng',
  address: '123 Lê Văn Sỹ',
  contactInfo: 'Chị Lan',
  verificationNote: 'Đã xem giấy phép hoạt động và gọi người phụ trách.',
  verifiedAt: '2026-11-01T03:00:00.000Z',
  supportCriteria: null,
  receivingPoint: null,
  ageGroups: [],
  categoryIds: [],
  areaProvince: null,
  isRemoteArea: false,
  isAccepting: true,
  status: 'active',
  openRequestCount: 0,
  requestCount: 0,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
}

describe('OrganizationDetails', () => {
  // UC34, R03 III.7.5.1 (2): what the Admin checked and when.
  it('shows the verification note and date', () => {
    renderWithProviders(<OrganizationDetails organization={organization} categoryNames={new Map()} />)

    expect(screen.getByText('Đã xem giấy phép hoạt động và gọi người phụ trách.')).toBeInTheDocument()
    expect(screen.getByText('01/11/2026')).toBeInTheDocument()
  })

  it('marks an organization saved before the check was recorded', () => {
    renderWithProviders(
      <OrganizationDetails
        organization={{ ...organization, verificationNote: null, verifiedAt: null }}
        categoryNames={new Map()}
      />,
    )

    expect(screen.getByText('Ghi chú xác minh')).toBeInTheDocument()
    expect(screen.getAllByText('Chưa nhập').length).toBeGreaterThanOrEqual(2)
  })
})
