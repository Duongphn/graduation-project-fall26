import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../../services/api-error'
import { renderWithProviders } from '../../../test/render'
import { accountsApi } from '../api'
import type { AccountDetail, AccountTrustBlock, TrustDecisionResult } from '../types'
import { TrustBlockCard } from './TrustBlockCard'

vi.mock('../api', () => ({
  accountsApi: { liftTrustBlock: vi.fn(), keepTrustBlock: vi.fn(), lockForTrustReview: vi.fn() },
}))

const lift = vi.mocked(accountsApi.liftTrustBlock)
const keep = vi.mocked(accountsApi.keepTrustBlock)
const lock = vi.mocked(accountsApi.lockForTrustReview)

const ID = '64b000000000000000000061'
const TOY_ID = '64b0000000000000000000f1'
const REASON = 'Đã xác minh qua điện thoại, trả đồ đúng hẹn.'

const openReview: AccountTrustBlock = {
  threshold: 50,
  depositLimit: 500_000,
  blocked: true,
  review: {
    requestedAt: '2026-11-25T02:00:00.000Z',
    lastBlockedAt: '2026-11-25T03:30:00.000Z',
    attemptCount: 3,
    toy: { id: TOY_ID, title: 'Xe điều khiển cọc cao' },
    depositPrice: 800_000,
    score: 35,
    threshold: 50,
    depositLimit: 500_000,
  },
  lift: null,
  lastDecision: null,
}

const account = (trustBlock: AccountTrustBlock, extra: Partial<AccountDetail> = {}): AccountDetail => ({
  id: ID,
  fullName: 'Người Thuê Điểm Thấp',
  avatar: null,
  maskedPhone: '+8490***0061',
  maskedEmail: 'th***@toyflow.test',
  phone: '+84900000061',
  email: 'thue@toyflow.test',
  role: 'USER',
  accountStatus: 'ACTIVE',
  lockedUntil: null,
  verificationStatus: 'verified',
  trustScore: 35,
  violationCount: 0,
  pendingReportCount: 0,
  trustBlockStatus: trustBlock.review ? 'review' : trustBlock.lift ? 'lifted' : null,
  createdAt: '2026-10-01T00:00:00.000Z',
  lastLoginAt: null,
  averageRating: null,
  completedBookingCount: 1,
  lock: null,
  activeListingCount: 0,
  violations: [],
  trustBlock,
  ...extra,
})

const renderCard = (detail: AccountDetail) =>
  renderWithProviders(
    <MemoryRouter>
      <TrustBlockCard account={detail} />
    </MemoryRouter>,
  )

const dialog = () => screen.getByRole('dialog')
const reasonBox = () => within(dialog()).getByLabelText(/Lý do gửi người dùng/)

beforeEach(() => {
  for (const mock of [lift, keep, lock]) {
    mock.mockReset()
    mock.mockResolvedValue({} as TrustDecisionResult)
  }
})

describe('TrustBlockCard (UC29, FE-09, R03 screen 47)', () => {
  it('shows the open review: score, threshold, attempts, times and the toy', () => {
    renderCard(account(openReview))

    expect(screen.getByText('Chờ xem xét Trust Score')).toBeInTheDocument()
    expect(screen.getByText('35 (ngưỡng 50)')).toBeInTheDocument()
    expect(screen.getByText('Số lần bị chặn').closest('tr')).toHaveTextContent('3')
    // Viet Nam time.
    expect(screen.getByText('09:00 25/11/2026')).toBeInTheDocument()
    expect(screen.getByText('10:30 25/11/2026')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Xe điều khiển cọc cao' })).toHaveAttribute('href', `/admin/toys/${TOY_ID}`)
    expect(screen.getByText(/800\.000/)).toBeInTheDocument()
    for (const name of ['Gỡ chặn', 'Giữ chặn', 'Khóa tài khoản']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
  })

  it('lifts with a trimmed reason after the confirmation dialog', async () => {
    const user = userEvent.setup()
    renderCard(account(openReview))

    await user.click(screen.getByRole('button', { name: 'Gỡ chặn' }))
    expect(within(dialog()).getByText('Gỡ chặn Trust Score?')).toBeInTheDocument()
    expect(within(dialog()).getByText(/không thấp hơn 35/)).toBeInTheDocument()
    await user.type(reasonBox(), `   ${REASON}   `)
    await user.click(within(dialog()).getByRole('button', { name: 'Gỡ chặn' }))
    await waitFor(() => expect(lift).toHaveBeenCalledWith(ID, REASON))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  }, 15_000)

  it('refuses a reason that is empty, only spaces or shorter than 20 characters', async () => {
    const user = userEvent.setup()
    renderCard(account(openReview))
    await user.click(screen.getByRole('button', { name: 'Giữ chặn' }))
    const ok = () => within(dialog()).getByRole('button', { name: 'Giữ chặn' })

    await user.click(ok())
    expect(await within(dialog()).findByText('Lý do cần ít nhất 20 ký tự.')).toBeInTheDocument()
    await user.type(reasonBox(), ' '.repeat(25))
    await user.click(ok())
    expect(await within(dialog()).findByText('Lý do cần ít nhất 20 ký tự.')).toBeInTheDocument()
    await user.clear(reasonBox())
    await user.type(reasonBox(), `  ${'a'.repeat(19)}  `)
    await user.click(ok())
    expect(await within(dialog()).findByText('Lý do cần ít nhất 20 ký tự.')).toBeInTheDocument()
    expect(keep).not.toHaveBeenCalled()

    // The text box stops at 300 characters.
    await user.clear(reasonBox())
    await user.click(reasonBox())
    await user.paste('b'.repeat(305))
    expect(reasonBox()).toHaveValue('b'.repeat(300))
    await user.click(ok())
    await waitFor(() => expect(keep).toHaveBeenCalledWith(ID, 'b'.repeat(300)))
  }, 20_000)

  it('locks from the review with the chosen duration', async () => {
    const user = userEvent.setup()
    renderCard(account(openReview))
    await user.click(screen.getByRole('button', { name: 'Khóa tài khoản' }))
    expect(within(dialog()).getByText('Khóa tài khoản này?')).toBeInTheDocument()
    expect(within(dialog()).getByRole('radio', { name: 'Khóa 7 ngày' })).toBeChecked()
    await user.click(within(dialog()).getByText('Khóa 30 ngày'))
    await user.type(reasonBox(), REASON)
    await user.click(within(dialog()).getByRole('button', { name: 'Khóa tài khoản' }))
    await waitFor(() => expect(lock).toHaveBeenCalledWith(ID, '30d', REASON))
  }, 15_000)

  it('keeps the dialog open and shows the server message on a conflict', async () => {
    keep.mockRejectedValue(
      new ApiError(409, 'TRUST_REVIEW_CHANGED', 'Yêu cầu xem xét Trust Score vừa thay đổi.'),
    )
    const user = userEvent.setup()
    renderCard(account(openReview))
    await user.click(screen.getByRole('button', { name: 'Giữ chặn' }))
    await user.type(reasonBox(), REASON)
    await user.click(within(dialog()).getByRole('button', { name: 'Giữ chặn' }))
    expect(await screen.findByText('Yêu cầu xem xét Trust Score vừa thay đổi.')).toBeInTheDocument()
    expect(dialog()).toBeInTheDocument()
  }, 15_000)

  it('shows "Đã gỡ chặn Trust Score" afterwards and offers to put the block back', async () => {
    const user = userEvent.setup()
    renderCard(
      account(
        {
          ...openReview,
          blocked: false,
          review: null,
          lift: {
            liftedAt: '2026-11-25T04:00:00.000Z',
            liftedBy: { id: 'a1', fullName: 'Quản trị viên' },
            reason: REASON,
            score: 35,
          },
          lastDecision: { action: 'lift', reason: REASON, decidedAt: '2026-11-25T04:00:00.000Z', decidedBy: null, score: 35 },
        },
        { trustBlockStatus: 'lifted' },
      ),
    )
    expect(screen.getAllByText('Đã gỡ chặn Trust Score')).toHaveLength(2)
    expect(screen.getByText(/bởi Quản trị viên/)).toBeInTheDocument()
    expect(screen.getByText(/từ 35 trở lên/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gỡ chặn' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Khóa tài khoản' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Áp dụng lại chặn' }))
    await user.type(reasonBox(), REASON)
    await user.click(within(dialog()).getByRole('button', { name: 'Áp dụng lại chặn' }))
    await waitFor(() => expect(keep).toHaveBeenCalledWith(ID, REASON))
  }, 15_000)

  it('shows the last "keep" decision and lets the Admin lift a blocked Renter without a review', () => {
    renderCard(
      account({
        ...openReview,
        review: null,
        lastDecision: { action: 'keep', reason: REASON, decidedAt: '2026-11-25T04:00:00.000Z', decidedBy: null, score: 35 },
      }),
    )
    expect(screen.getByText('Đang chặn thuê đồ cọc cao')).toBeInTheDocument()
    expect(screen.getByText('Quyết định gần nhất: Giữ chặn')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gỡ chặn' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Giữ chặn' })).not.toBeInTheDocument()
  })

  it('hides the lock action on a locked account and the whole card when nothing applies', () => {
    const { unmount } = renderCard(account(openReview, { accountStatus: 'LOCKED' }))
    expect(screen.queryByRole('button', { name: 'Khóa tài khoản' })).not.toBeInTheDocument()
    unmount()

    renderCard(account({ ...openReview, blocked: false, review: null }, { trustScore: 90 }))
    expect(screen.queryByText('Chặn thuê do Trust Score')).not.toBeInTheDocument()
    renderCard(account(openReview, { role: 'ADMIN' }))
    expect(screen.queryByText('Chặn thuê do Trust Score')).not.toBeInTheDocument()
  })
})
