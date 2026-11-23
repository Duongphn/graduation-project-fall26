import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import { categoriesApi } from '../../categories/api'
import { organizationsApi } from '../api'
import type { Organization } from '../types'
import { OrganizationFormModal } from './OrganizationFormModal'

// No network: the api modules are replaced; each test decides what the server answers.
vi.mock('../api', () => ({
  organizationsApi: { get: vi.fn(), create: vi.fn(), update: vi.fn() },
}))
vi.mock('../../categories/api', () => ({
  categoriesApi: { adminOptions: vi.fn() },
}))

const get = vi.mocked(organizationsApi.get)
const create = vi.mocked(organizationsApi.create)
const update = vi.mocked(organizationsApi.update)

const PUZZLE = '64b000000000000000000001'

const organization: Organization = {
  id: '64b0000000000000000000aa',
  name: 'Mái ấm Hoa Hồng',
  address: '123 Lê Văn Sỹ, Phường Nhiêu Lộc',
  contactInfo: 'Chị Lan',
  verificationNote: 'Đã xem giấy phép hoạt động.',
  verifiedAt: '2026-11-01T00:00:00.000Z',
  supportCriteria: null,
  receivingPoint: {
    province: 'TP. Hồ Chí Minh',
    ward: 'Phường Nhiêu Lộc',
    street: '123 Lê Văn Sỹ',
    openingHours: '8:00 – 17:00',
    contactName: 'Nguyễn Thị Lan',
    contactPhone: '+84912345678',
    acceptsDropOff: true,
    acceptsParcel: false,
  },
  ageGroups: [{ minAge: 3, maxAge: 6 }],
  categoryIds: [PUZZLE],
  areaProvince: 'TP. Hồ Chí Minh',
  isRemoteArea: false,
  isAccepting: true,
  status: 'active',
  openRequestCount: 0,
  requestCount: 0,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
}

const renderForm = (organizationId?: string) => {
  const onClose = vi.fn()
  renderWithProviders(<OrganizationFormModal open organizationId={organizationId} onClose={onClose} />)
  return { onClose, user: userEvent.setup() }
}

beforeEach(() => {
  get.mockReset()
  create.mockReset()
  update.mockReset()
  vi.mocked(categoriesApi.adminOptions).mockResolvedValue([
    { id: PUZZLE, name: 'Xếp hình', status: 'active' },
  ])
})

describe('OrganizationFormModal', () => {
  // Fills about 15 fields: ~4 s alone, over vitest's 5 s default when the whole suite runs.
  it('sends the receiving point and the needs, age groups as [minAge, maxAge)', async () => {
    get.mockResolvedValue(organization)
    update.mockResolvedValue({ data: organization })
    const { onClose, user } = renderForm(organization.id)

    await user.click(await screen.findByRole('checkbox', { name: '0–12 tháng' }))
    await user.click(screen.getByRole('checkbox', { name: 'Nhận bưu kiện qua vận chuyển' }))
    await user.click(screen.getByRole('switch'))
    await user.click(screen.getByRole('button', { name: /Lưu/ }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(update).toHaveBeenCalledWith(organization.id, {
      name: organization.name,
      address: organization.address,
      contactInfo: organization.contactInfo,
      verificationNote: organization.verificationNote,
      receivingPoint: {
        ...organization.receivingPoint,
        contactPhone: '0912345678',
        acceptsParcel: true,
      },
      ageGroups: [
        { minAge: 0, maxAge: 1 },
        { minAge: 3, maxAge: 6 },
      ],
      categoryIds: [PUZZLE],
      areaProvince: 'TP. Hồ Chí Minh',
      isRemoteArea: false,
      isAccepting: false,
    })
  }, 15_000)

  it('needs at least one handover method (GB-51)', async () => {
    get.mockResolvedValue(organization)
    const { user } = renderForm(organization.id)

    await user.click(await screen.findByRole('checkbox', { name: 'Nhận đồ mang đến' }))
    await user.click(screen.getByRole('button', { name: /Lưu/ }))

    expect(await screen.findByText('Chọn ít nhất một cách bàn giao.')).toBeInTheDocument()
    expect(update).not.toHaveBeenCalled()
  })

  it('asks for the point and the needs of an organization saved before they existed', async () => {
    get.mockResolvedValue({
      ...organization,
      receivingPoint: null,
      ageGroups: [],
      categoryIds: [],
      areaProvince: null,
      verificationNote: null,
      verifiedAt: null,
    })
    const { user } = renderForm(organization.id)

    await screen.findByRole('checkbox', { name: '0–12 tháng' })
    await user.click(screen.getByRole('button', { name: /Lưu/ }))

    expect(await screen.findByText('Chọn ít nhất một nhóm tuổi.')).toBeInTheDocument()
    // UC34: the Admin records what was checked.
    expect(screen.getByText('Ghi chú xác minh cần từ 5 đến 500 ký tự.')).toBeInTheDocument()
    expect(screen.getByText('Chọn ít nhất một danh mục.')).toBeInTheDocument()
    expect(screen.getByText('Tỉnh/Thành phố cần từ 2 đến 100 ký tự.')).toBeInTheDocument()
    expect(update).not.toHaveBeenCalled()
  })
})
