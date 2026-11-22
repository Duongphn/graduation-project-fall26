import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import { violationReportsApi } from '../api'
import type { ReportDetail, ResolveReportResult } from '../types'
import { ResolveReportCard } from './ResolveReportCard'

vi.mock('../api', () => ({ violationReportsApi: { resolve: vi.fn() } }))

const resolve = vi.mocked(violationReportsApi.resolve)

const baseReport: ReportDetail = {
  id: '64b000000000000000000010',
  status: 'pending',
  reason: 'unsafe_toy',
  isUnsafe: true,
  unsafeIssues: ['small_parts'],
  description: 'Bánh xe bị nứt.',
  target: { kind: 'toy', id: '64b000000000000000000020', label: 'Xe gỗ' },
  reporter: { id: '64b000000000000000000030', fullName: 'Người báo cáo', maskedPhone: '+8490***0001' },
  reportedUser: {
    id: '64b000000000000000000040',
    fullName: 'Chủ đồ chơi',
    maskedPhone: '+8490***0002',
    role: 'USER',
    accountStatus: 'ACTIVE',
    lockedUntil: null,
    violationCount: 1,
    pendingReportCount: 2,
  },
  toy: null,
  message: null,
  evidence: [],
  evidenceCount: 0,
  resolution: null,
  otherPendingReports: 1,
  createdAt: '2026-11-18T00:00:00.000Z',
}

const confirm = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Xác nhận' }))
  // The popconfirm's own confirm button.
  const buttons = await screen.findAllByRole('button', { name: 'Xác nhận' })
  await user.click(buttons[buttons.length - 1]!)
}

beforeEach(() => {
  resolve.mockReset()
  resolve.mockResolvedValue({} as ResolveReportResult)
})

describe('ResolveReportCard (UC29)', () => {
  it('offers remove listing only for a toy report', () => {
    const { unmount } = renderWithProviders(<ResolveReportCard report={baseReport} />)
    expect(screen.getByRole('radio', { name: 'Gỡ tin đăng' })).toBeInTheDocument()
    expect(screen.getByText(/1 báo cáo khác đang chờ/)).toBeInTheDocument()
    unmount()

    renderWithProviders(
      <ResolveReportCard report={{ ...baseReport, reason: 'scam', target: { kind: 'user', id: 'x', label: 'An' } }} />,
    )
    expect(screen.queryByRole('radio', { name: 'Gỡ tin đăng' })).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Cảnh cáo' })).toBeInTheDocument()
  })

  it('asks for a lock duration and a reason of at least 20 characters, then sends them', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ResolveReportCard report={baseReport} />)

    await user.click(screen.getByText('Khóa tài khoản'))
    await user.type(screen.getByLabelText(/Lý do gửi người dùng/), 'Vi phạm nhiều lần')
    await confirm(user)
    expect(await screen.findByText('Vui lòng chọn thời hạn khóa.')).toBeInTheDocument()
    expect(screen.getByText('Lý do khóa tài khoản cần ít nhất 20 ký tự.')).toBeInTheDocument()
    expect(resolve).not.toHaveBeenCalled()

    await user.click(screen.getByText('Khóa 30 ngày'))
    await user.type(screen.getByLabelText(/Lý do gửi người dùng/), ', đăng đồ chơi nguy hiểm')
    await confirm(user)
    await waitFor(() =>
      expect(resolve).toHaveBeenCalledWith(baseReport.id, {
        action: 'lock',
        lockDuration: '30d',
        note: 'Vi phạm nhiều lần, đăng đồ chơi nguy hiểm',
      }),
    )
  }, 15_000)

  it('dismisses with a short note and no lock duration', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ResolveReportCard report={baseReport} />)
    await user.type(screen.getByLabelText(/Ghi chú/), 'Không thấy vi phạm')
    await confirm(user)
    await waitFor(() =>
      expect(resolve).toHaveBeenCalledWith(baseReport.id, { action: 'dismiss', note: 'Không thấy vi phạm' }),
    )
  }, 15_000)
})
