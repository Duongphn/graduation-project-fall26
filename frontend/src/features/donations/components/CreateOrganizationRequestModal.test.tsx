import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import { organizationsApi } from '../../organizations/api'
import type { Organization } from '../../organizations/types'
import { toyModerationApi } from '../../toy-moderation/api'
import type { ToyModerationListItem } from '../../toy-moderation/types'
import { CreateOrganizationRequestModal } from './CreateOrganizationRequestModal'

// No network: the admin api modules are replaced; each test decides what the server answers.
vi.mock('../../organizations/api', () => ({ organizationsApi: { list: vi.fn() } }))
vi.mock('../../toy-moderation/api', () => ({ toyModerationApi: { queue: vi.fn() } }))
vi.mock('../api', () => ({ donationRequestsApi: { create: vi.fn() } }))

const PUZZLE = '64b000000000000000000001'

const page = <T,>(items: T[]) => ({
  items,
  pagination: { page: 1, limit: 20, totalItems: items.length, totalPages: 1 },
})

const toy = {
  id: '64c000000000000000000001',
  title: 'Bộ xếp hình gỗ',
  category: { id: PUZZLE, name: 'Xếp hình', status: 'active' },
  owner: { id: 'u1', fullName: 'Người Tặng', maskedPhone: '09******01', verificationStatus: 'verified' },
} as unknown as ToyModerationListItem

const point = {
  province: 'Hà Nội',
  ward: 'Phường Hoàn Kiếm',
  street: '12 Hàng Bài',
  openingHours: '8:00–17:00',
  contactName: 'Cô Lan',
  contactPhone: '+84912000111',
  acceptsDropOff: true,
  acceptsParcel: true,
}

const organization = (name: string, overrides: Partial<Organization> = {}) =>
  ({
    id: `66a${name.length.toString().padStart(21, '0')}`,
    name,
    isAccepting: true,
    receivingPoint: point,
    categoryIds: [PUZZLE],
    ...overrides,
  }) as Organization

const openOrganizationPicker = async (user: ReturnType<typeof userEvent.setup>) => {
  const field = screen.getByText('Tổ chức tiếp nhận').closest('.ant-form-item') as HTMLElement
  await user.click(within(field).getByRole('combobox'))
}

const optionOf = async (title: string) =>
  (await screen.findByTitle(title)).closest('.ant-select-item-option') as HTMLElement

beforeEach(() => {
  vi.mocked(toyModerationApi.queue).mockResolvedValue(page([toy]))
})

describe('CreateOrganizationRequestModal', () => {
  // GB-51: an organization without a receiving point takes no request (the server answers 409).
  it('disables an organization without a receiving point', async () => {
    vi.mocked(organizationsApi.list).mockResolvedValue(
      page([organization('Mái ấm Hoa Sen'), organization('Nhà mở cũ', { receivingPoint: null })]),
    )
    renderWithProviders(
      <MemoryRouter>
        <CreateOrganizationRequestModal open onClose={() => undefined} />
      </MemoryRouter>,
    )
    const user = userEvent.setup()
    await openOrganizationPicker(user)

    expect(await optionOf('Nhà mở cũ (chưa có điểm nhận)')).toHaveClass('ant-select-item-option-disabled')
    expect(await optionOf('Mái ấm Hoa Sen')).not.toHaveClass('ant-select-item-option-disabled')
  })
})
