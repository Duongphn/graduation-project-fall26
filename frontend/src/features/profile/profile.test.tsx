import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AccountMenu } from '../../layouts/site/account-menu'
import { ADMIN_ROOT, PATHS } from '../../routes/paths'
import { httpClient } from '../../services/http-client'
import { createTestQueryClient, renderWithProviders } from '../../test/render'
import { AddressBookCard } from './components/address-book-card'
import { PersonalInfoForm } from './components/personal-info-form'
import { ProfileHero } from './components/profile-hero'
import type { DeliveryAddress, UserProfile } from './profile-api'
import { addressesQuery } from './profile-queries'

// No network: each test decides what the server answers.
vi.mock('../../services/http-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/http-client')>()),
  httpClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

const get = vi.mocked(httpClient.get)
const post = vi.mocked(httpClient.post)
const patch = vi.mocked(httpClient.patch)
const remove = vi.mocked(httpClient.delete)
const ok = <T,>(data: T) => ({ data: { success: true, data } }) as never

const PROFILE: UserProfile = {
  id: 'u1',
  fullName: 'Nguyễn Thị Lan',
  email: 'lan@example.com',
  phone: '0912345678',
  dateOfBirth: null,
  gender: null,
  bio: null,
  trustScore: 87,
  memberSince: '2026-03-05T08:00:00.000Z',
  verificationStatus: 'unverified',
  role: 'USER',
}

const HOME: DeliveryAddress = {
  id: 'a1',
  recipientName: 'Nguyễn Thị Lan',
  phone: '0912345678',
  province: 'Hà Nội',
  ward: 'Phường Cầu Giấy',
  street: '12 Xuân Thủy',
  isDefault: true,
}
const OFFICE: DeliveryAddress = {
  id: 'a2',
  recipientName: 'Trần Văn Nam',
  phone: '0987654321',
  province: 'TP. Hồ Chí Minh',
  ward: 'Phường Bến Nghé',
  street: '5 Lê Lợi',
  isDefault: false,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Menu tài khoản ở header (R03 UC03, UC04, UC26)', () => {
  it('có link Hồ sơ, Xác minh danh tính và Thông báo', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <MemoryRouter>
        <AccountMenu />
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('button', { name: 'Tài khoản của tôi' }))
    const menu = screen.getByRole('navigation', { name: 'Tài khoản' })
    expect(within(menu).getByRole('link', { name: /Hồ sơ của tôi/ })).toHaveAttribute('href', PATHS.profile)
    expect(within(menu).getByRole('link', { name: /Xác minh danh tính/ })).toHaveAttribute('href', PATHS.identityVerification)
    expect(within(menu).getByRole('link', { name: /Thông báo/ })).toHaveAttribute('href', PATHS.notifications)
  })
})

describe('Mục "Quản trị" trong menu tài khoản (chỉ Admin)', () => {
  const openMenuAs = async (role: 'USER' | 'ADMIN') => {
    localStorage.setItem('toyflow-access-token', `h.${btoa(JSON.stringify({ role }))}.s`)
    const user = userEvent.setup()
    renderWithProviders(
      <MemoryRouter>
        <AccountMenu />
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('button', { name: 'Tài khoản của tôi' }))
    return screen.getByRole('navigation', { name: 'Tài khoản' })
  }

  afterEach(() => localStorage.clear())

  it('Admin thấy link Quản trị tới /admin', async () => {
    const menu = await openMenuAs('ADMIN')
    expect(within(menu).getByRole('link', { name: /Quản trị/ })).toHaveAttribute('href', ADMIN_ROOT)
  })

  it('User không thấy link Quản trị', async () => {
    const menu = await openMenuAs('USER')
    expect(within(menu).queryByRole('link', { name: /Quản trị/ })).toBeNull()
  })
})

describe('Thông tin cá nhân (R03 III.6.1.1 (3)–(8))', () => {
  it('lưu ngày sinh, giới tính và giới thiệu', async () => {
    const user = userEvent.setup()
    patch.mockResolvedValue(ok({ ...PROFILE, dateOfBirth: '1990-05-17', gender: 'female', bio: 'Mẹ của hai bé.' }))
    const onSaved = vi.fn()
    renderWithProviders(<PersonalInfoForm profile={PROFILE} onSaved={onSaved} />)

    const save = screen.getByRole('button', { name: 'Lưu thay đổi' })
    expect(save).toBeDisabled()

    await user.type(screen.getByLabelText('Ngày sinh'), '1990-05-17')
    await user.selectOptions(screen.getByLabelText('Giới tính'), 'Nữ')
    await user.type(screen.getByLabelText('Giới thiệu ngắn'), 'Mẹ của hai bé.')
    expect(screen.getByText('14/200')).toBeInTheDocument()
    await user.click(save)

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(patch).toHaveBeenCalledWith('/users/profile', {
      fullName: 'Nguyễn Thị Lan',
      dateOfBirth: '1990-05-17',
      gender: 'female',
      bio: 'Mẹ của hai bé.',
    })
  })

  it('báo lỗi khi giới thiệu quá 200 ký tự và không gửi', async () => {
    const user = userEvent.setup()
    renderWithProviders(<PersonalInfoForm profile={{ ...PROFILE, bio: 'a'.repeat(200) }} onSaved={vi.fn()} />)
    await user.type(screen.getByLabelText('Giới thiệu ngắn'), 'b')
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }))
    expect(await screen.findByText('Giới thiệu tối đa 200 ký tự.')).toBeInTheDocument()
    expect(patch).not.toHaveBeenCalled()
  })

  it('hiện Điểm uy tín, ngày tham gia (chỉ đọc) và mục hoàn thiện Ngày sinh thay cho SĐT', () => {
    renderWithProviders(
      <MemoryRouter>
        <ProfileHero profile={{ ...PROFILE, dateOfBirth: '1990-05-17' }} latestVerification={null} hasAddress onAvatarSaved={vi.fn()} />
      </MemoryRouter>,
    )
    expect(screen.getByText('87/100')).toBeInTheDocument()
    expect(screen.getByText('05/03/2026')).toBeInTheDocument()
    const completion = screen.getByRole('complementary', { name: 'Mức hoàn thiện hồ sơ' })
    expect(within(completion).getByText('Ngày sinh')).toBeInTheDocument()
    expect(within(completion).queryByText('Số điện thoại')).toBeNull()
    // Email, ngày sinh, địa chỉ: 3/5
    expect(within(completion).getByText('60%')).toBeInTheDocument()
  })
})

describe('Sổ địa chỉ (R03 III.6.1.1 (9)–(11))', () => {
  const renderBook = (addresses: DeliveryAddress[]) => {
    const queryClient = createTestQueryClient()
    queryClient.setQueryData(addressesQuery.queryKey, addresses)
    const onSaved = vi.fn()
    renderWithProviders(<AddressBookCard profile={PROFILE} onSaved={onSaved} />, queryClient)
    return { user: userEvent.setup(), onSaved }
  }

  it('hiện nhiều địa chỉ, nhãn Mặc định ở địa chỉ mặc định', () => {
    renderBook([HOME, OFFICE])
    const items = within(screen.getByRole('list', { name: 'Sổ địa chỉ' })).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]!).getByText('Mặc định')).toBeInTheDocument()
    expect(within(items[0]!).getByText('12 Xuân Thủy, Phường Cầu Giấy, Hà Nội')).toBeInTheDocument()
    expect(within(items[1]!).queryByText('Mặc định')).toBeNull()
    expect(screen.queryByLabelText('Quận/Huyện')).toBeNull()
  })

  it('thêm địa chỉ mới qua hộp thoại, có thể đặt làm mặc định', async () => {
    const { user, onSaved } = renderBook([HOME])
    post.mockResolvedValue(ok({ ...OFFICE, isDefault: true }))
    get.mockResolvedValue(ok([{ ...OFFICE, isDefault: true }, { ...HOME, isDefault: false }]))

    await user.click(screen.getByRole('button', { name: 'Thêm địa chỉ' }))
    const dialog = await screen.findByRole('dialog', { name: 'Thêm địa chỉ nhận hàng' })
    const recipient = within(dialog).getByLabelText(/Người nhận/)
    expect(recipient).toHaveValue('Nguyễn Thị Lan')
    await user.clear(recipient)
    await user.type(recipient, OFFICE.recipientName)
    await user.clear(within(dialog).getByLabelText(/Số điện thoại/))
    await user.type(within(dialog).getByLabelText(/Số điện thoại/), OFFICE.phone)
    await user.type(within(dialog).getByLabelText(/Tỉnh\/Thành phố/), OFFICE.province)
    await user.type(within(dialog).getByLabelText(/Phường\/Xã/), OFFICE.ward)
    await user.type(within(dialog).getByLabelText(/Số nhà, tên đường/), OFFICE.street)
    await user.click(within(dialog).getByLabelText('Đặt làm địa chỉ mặc định'))
    await user.click(within(dialog).getByRole('button', { name: 'Lưu địa chỉ' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('Đã thêm địa chỉ.'))
    expect(post).toHaveBeenCalledWith('/users/addresses', {
      recipientName: OFFICE.recipientName,
      phone: OFFICE.phone,
      province: OFFICE.province,
      ward: OFFICE.ward,
      street: OFFICE.street,
      isDefault: true,
    })
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2))
  })

  it('sửa một địa chỉ', async () => {
    const { user, onSaved } = renderBook([HOME, OFFICE])
    patch.mockResolvedValue(ok({ ...OFFICE, street: '7 Lê Lợi' }))
    get.mockResolvedValue(ok([HOME, { ...OFFICE, street: '7 Lê Lợi' }]))

    await user.click(screen.getByRole('button', { name: /Sửa địa chỉ 5 Lê Lợi/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Sửa địa chỉ nhận hàng' })
    const street = within(dialog).getByLabelText(/Số nhà, tên đường/)
    await user.clear(street)
    await user.type(street, '7 Lê Lợi')
    await user.click(within(dialog).getByRole('button', { name: 'Lưu địa chỉ' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('Đã lưu địa chỉ.'))
    expect(patch).toHaveBeenCalledWith('/users/addresses/a2', expect.objectContaining({ street: '7 Lê Lợi', isDefault: false }))
  })

  it('xoá một địa chỉ sau khi xác nhận', async () => {
    const { user, onSaved } = renderBook([HOME, OFFICE])
    remove.mockResolvedValue({} as never)
    get.mockResolvedValue(ok([HOME]))

    await user.click(screen.getByRole('button', { name: /Xoá địa chỉ 5 Lê Lợi/ }))
    await user.click(await screen.findByRole('button', { name: 'Xoá' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('Đã xoá địa chỉ.'))
    expect(remove).toHaveBeenCalledWith('/users/addresses/a2')
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1))
  })

  it('báo lỗi khi SĐT người nhận sai định dạng', async () => {
    const { user } = renderBook([])
    await user.click(screen.getByRole('button', { name: 'Thêm địa chỉ' }))
    const dialog = await screen.findByRole('dialog')
    const phone = within(dialog).getByLabelText(/Số điện thoại/)
    await user.clear(phone)
    await user.type(phone, '091234')
    await user.click(within(dialog).getByRole('button', { name: 'Lưu địa chỉ' }))
    expect(await within(dialog).findByText('Số điện thoại gồm 10 chữ số, bắt đầu bằng 0.')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })
})
