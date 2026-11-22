import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import { accountsApi } from '../api'
import type { AccountActionResult, AccountDetail } from '../types'
import { AccountEnforcementCard } from './AccountEnforcementCard'

vi.mock('../api', () => ({ accountsApi: { lock: vi.fn(), unlock: vi.fn() } }))

const lock = vi.mocked(accountsApi.lock)
const unlock = vi.mocked(accountsApi.unlock)

const account: AccountDetail = {
  id: '64b000000000000000000040',
  fullName: 'Chủ đồ chơi',
  avatar: null,
  maskedPhone: '+8490***0002',
  maskedEmail: 'ch***@toyflow.test',
  phone: '+84900000002',
  email: 'chu@toyflow.test',
  role: 'USER',
  accountStatus: 'ACTIVE',
  lockedUntil: null,
  verificationStatus: 'verified',
  trustScore: 80,
  violationCount: 2,
  pendingReportCount: 0,
  createdAt: '2026-10-01T00:00:00.000Z',
  lock: null,
  activeListingCount: 3,
  violations: [],
}

const REASON = 'Nhiều lần đăng đồ chơi không an toàn.'

const confirm = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Xác nhận' }))
  const buttons = await screen.findAllByRole('button', { name: 'Xác nhận' })
  await user.click(buttons[buttons.length - 1]!)
}

beforeEach(() => {
  lock.mockReset()
  unlock.mockReset()
  lock.mockResolvedValue({} as AccountActionResult)
  unlock.mockResolvedValue({} as AccountActionResult)
})

describe('AccountEnforcementCard (UC29)', () => {
  it('locks an active account with the chosen duration and a reason of 20+ characters', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AccountEnforcementCard account={account} />)
    expect(screen.queryByRole('radio', { name: 'Mở khóa' })).not.toBeInTheDocument()

    await user.type(screen.getByLabelText(/Lý do gửi người dùng/), 'Vi phạm')
    await confirm(user)
    expect(await screen.findByText('Lý do cần ít nhất 20 ký tự.')).toBeInTheDocument()
    expect(lock).not.toHaveBeenCalled()

    await user.click(screen.getByText('Khóa vĩnh viễn'))
    await user.clear(screen.getByLabelText(/Lý do gửi người dùng/))
    await user.type(screen.getByLabelText(/Lý do gửi người dùng/), REASON)
    await confirm(user)
    await waitFor(() => expect(lock).toHaveBeenCalledWith(account.id, 'permanent', REASON))
  }, 15_000)

  it('offers only Unlock for a locked account', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AccountEnforcementCard account={{ ...account, accountStatus: 'LOCKED' }} />)
    expect(screen.queryByRole('radio', { name: 'Khóa 7 ngày' })).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Mở khóa' })).toBeChecked()

    await user.type(screen.getByLabelText(/Lý do gửi người dùng/), REASON)
    await confirm(user)
    await waitFor(() => expect(unlock).toHaveBeenCalledWith(account.id, REASON))
  }, 15_000)

  it('cannot lock an Admin account', () => {
    renderWithProviders(<AccountEnforcementCard account={{ ...account, role: 'ADMIN' }} />)
    expect(screen.getByText('Không thể khóa tài khoản Admin.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Xác nhận' })).not.toBeInTheDocument()
  })
})
