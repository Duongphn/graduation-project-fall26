import { screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import { accountsApi } from '../api'
import type { AccountDetail } from '../types'
import { AccountDetailPage } from './AccountDetailPage'

vi.mock('../api', () => ({ accountsApi: { detail: vi.fn(), lock: vi.fn(), unlock: vi.fn() } }))

const detail = vi.mocked(accountsApi.detail)

const ID = '64b000000000000000000050'
const DISPUTE_ID = '64b0000000000000000000d1'
const REPORT_ID = '64b0000000000000000000a1'

const account: AccountDetail = {
  id: ID,
  fullName: 'Người Thuê Trễ',
  avatar: null,
  maskedPhone: '+8490***0050',
  maskedEmail: 'tr***@toyflow.test',
  phone: '+84900000050',
  email: 'tre@toyflow.test',
  role: 'USER',
  accountStatus: 'ACTIVE',
  lockedUntil: null,
  verificationStatus: 'verified',
  trustScore: 64,
  violationCount: 3,
  pendingReportCount: 1,
  createdAt: '2026-10-01T00:00:00.000Z',
  lastLoginAt: '2026-11-22T03:05:00.000Z',
  averageRating: null,
  completedBookingCount: 4,
  lock: null,
  activeListingCount: 2,
  violations: [
    {
      source: 'dispute',
      id: DISPUTE_ID,
      date: '2026-11-20T03:00:00.000Z',
      orderCode: 'RT261120ABC',
      ruling: 'RENTER_AT_FAULT',
      note: 'Đồ chơi trả về bị gãy bánh xe.',
    },
    {
      source: 'report',
      id: REPORT_ID,
      date: '2026-11-18T03:00:00.000Z',
      reason: 'harassment',
      targetKind: 'user',
      action: 'warn',
      note: 'Nhắn tin quấy rối.',
      reportCount: 1,
    },
    {
      source: 'late_return',
      id: '64b0000000000000000000e1',
      date: '2026-11-10T03:00:00.000Z',
      orderCode: 'RT261101XYZ',
      lateDays: 2,
      lateFee: 40_000,
    },
  ],
}

const renderPage = () => {
  const router = createMemoryRouter([{ path: '/admin/users/:id', element: <AccountDetailPage /> }], {
    initialEntries: [`/admin/users/${ID}`],
  })
  renderWithProviders(<RouterProvider router={router} />)
}

beforeEach(() => {
  detail.mockReset()
  detail.mockResolvedValue(account)
})

describe('AccountDetailPage (R03 III.7.2.1 (5)-(7))', () => {
  it('shows the last sign-in, the completed bookings and no average rating yet', async () => {
    renderPage()

    const profile = (await screen.findByText('Hồ sơ')).closest('.ant-card') as HTMLElement
    // Shown in Viet Nam time.
    expect(within(profile).getByText('Đăng nhập gần nhất')).toBeInTheDocument()
    expect(within(profile).getByText('10:05 22/11/2026')).toBeInTheDocument()

    const metrics = screen.getByText('Chỉ số hoạt động').closest('.ant-card') as HTMLElement
    expect(within(metrics).getByText('64')).toBeInTheDocument()
    expect(within(metrics).getByText('Đánh giá trung bình')).toBeInTheDocument()
    expect(within(metrics).getByText('Chưa có')).toBeInTheDocument()
    expect(within(metrics).getByText('Đơn thuê hoàn tất')).toBeInTheDocument()
    expect(within(metrics).getByText('4')).toBeInTheDocument()
    expect(within(metrics).getByText('Số vi phạm')).toBeInTheDocument()
  })

  it('lists every source of breach with its date and a link to its report or dispute', async () => {
    renderPage()

    const history = (await screen.findByText('Lịch sử vi phạm')).closest('.ant-card') as HTMLElement
    const rows = within(history).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(3)

    expect(within(rows[0]!).getByText('20/11/2026')).toBeInTheDocument()
    expect(within(rows[0]!).getByRole('link', { name: 'Khiếu nại đơn RT261120ABC' })).toHaveAttribute(
      'href',
      `/admin/disputes/${DISPUTE_ID}`,
    )
    expect(within(rows[0]!).getByText('Người thuê có lỗi')).toBeInTheDocument()
    expect(within(rows[0]!).getByText('Đồ chơi trả về bị gãy bánh xe.')).toBeInTheDocument()

    expect(within(rows[1]!).getByRole('link', { name: 'Báo cáo người dùng' })).toHaveAttribute(
      'href',
      `/admin/violation-reports/${REPORT_ID}`,
    )
    expect(within(rows[1]!).getByText('Cảnh cáo')).toBeInTheDocument()

    expect(within(rows[2]!).getByText('10/11/2026')).toBeInTheDocument()
    expect(within(rows[2]!).getByText('Trả trễ đơn RT261101XYZ')).toBeInTheDocument()
    expect(within(rows[2]!).getByText('Trả trễ 2 ngày')).toBeInTheDocument()
    expect(within(rows[2]!).getByText(/Phí trả trễ 40\.000/)).toBeInTheDocument()
  })

  it('shows one row for one Admin decision that closed several reports (DEF-ST-27)', async () => {
    detail.mockResolvedValue({
      ...account,
      violationCount: 1,
      violations: [
        {
          source: 'report',
          id: REPORT_ID,
          date: '2026-11-18T03:00:00.000Z',
          reason: 'unsafe_toy',
          targetKind: 'toy',
          action: 'remove_listing',
          note: 'Đồ chơi có pin cúc áo lộ ra ngoài.',
          reportCount: 2,
        },
      ],
    })
    renderPage()

    const history = (await screen.findByText('Lịch sử vi phạm')).closest('.ant-card') as HTMLElement
    const rows = within(history).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(1)
    expect(within(rows[0]!).getByRole('link', { name: 'Báo cáo tin đăng' })).toBeInTheDocument()
    expect(within(rows[0]!).getByText('Xử lý cùng lúc 2 báo cáo')).toBeInTheDocument()
    expect(within(rows[0]!).getByText('Gỡ tin đăng')).toBeInTheDocument()
    const metrics = screen.getByText('Chỉ số hoạt động').closest('.ant-card') as HTMLElement
    expect(within(metrics).getByText('Số vi phạm').closest('tr')).toHaveTextContent('Số vi phạm1')
  })

  it('says so when the last sign-in is not recorded yet', async () => {
    detail.mockResolvedValue({ ...account, lastLoginAt: null, violations: [] })
    renderPage()

    expect(await screen.findByText('Chưa ghi nhận')).toBeInTheDocument()
    expect(screen.getByText('Chưa có vi phạm nào.')).toBeInTheDocument()
  })
})
