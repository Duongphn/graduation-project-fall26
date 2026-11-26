import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import type { Organization } from '../types'
import { OrganizationRowActions } from './OrganizationRowActions'

// No network: nothing is confirmed in these tests.
vi.mock('../api', () => ({
  organizationsApi: { hide: vi.fn(), show: vi.fn(), remove: vi.fn() },
}))

const organization: Organization = {
  id: '64b0000000000000000000aa',
  name: 'Mái ấm Hoa Hồng',
  address: '123 Lê Văn Sỹ',
  contactInfo: 'Chị Lan',
  verificationNote: 'Đã xem giấy phép hoạt động.',
  verifiedAt: '2026-11-01T00:00:00.000Z',
  supportCriteria: null,
  receivingPoint: null,
  ageGroups: [],
  categoryIds: [],
  areaProvince: null,
  isRemoteArea: false,
  isAccepting: true,
  status: 'active',
  openRequestCount: 2,
  requestCount: 5,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
}

describe('OrganizationRowActions', () => {
  it('warns with MSG57 before hiding an organization with open requests, and blocks delete', async () => {
    renderWithProviders(<OrganizationRowActions organization={organization} onEdit={vi.fn()} />)
    const user = userEvent.setup()

    expect(screen.getByRole('button', { name: /Xoá/ })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /Ẩn/ }))
    expect(
      await screen.findByText(
        '2 yêu cầu quyên góp vẫn đang mở. Yêu cầu đã chấp nhận sẽ tiếp tục. Yêu cầu đang chờ cần được từ chối hoặc huỷ.',
      ),
    ).toBeInTheDocument()
  })
})
