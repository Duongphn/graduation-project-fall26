import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import { auditLogsApi } from '../api'
import type { AuditLogItem } from '../types'
import { AuditLogPage } from './AuditLogPage'

vi.mock('../api', () => ({ auditLogsApi: { list: vi.fn(), filters: vi.fn() } }))

const list = vi.mocked(auditLogsApi.list)
const filters = vi.mocked(auditLogsApi.filters)

const ADMIN_ID = '64b000000000000000000001'

const rows: AuditLogItem[] = [
  {
    id: '1',
    action: 'user.lock',
    actor: { id: ADMIN_ID, fullName: 'Admin Một' },
    targetType: 'USER',
    targetId: '64b0000000000000000000aa',
    details: { duration: '7d', reason: 'Đăng đồ chơi nguy hiểm' },
    ipAddress: '10.0.0.1',
    createdAt: '2026-11-18T03:00:00.000Z',
  },
  {
    id: '2',
    action: 'user.unlock',
    actor: null,
    targetType: 'USER',
    targetId: '64b0000000000000000000bb',
    details: { expired: true },
    ipAddress: null,
    createdAt: '2026-11-18T02:00:00.000Z',
  },
]

const renderAt = (url: string) => {
  const router = createMemoryRouter([{ path: '/admin/audit-logs', element: <AuditLogPage /> }], {
    initialEntries: [url],
  })
  renderWithProviders(<RouterProvider router={router} />)
}

beforeEach(() => {
  list.mockReset()
  filters.mockReset()
  list.mockResolvedValue({
    items: rows,
    pagination: { page: 1, limit: 20, totalItems: 2, totalPages: 1, hasNextPage: false, hasPrevPage: false },
  })
  filters.mockResolvedValue({ actions: ['user.lock', 'user.unlock'], actors: [{ id: ADMIN_ID, fullName: 'Admin Một' }] })
})

describe('AuditLogPage (UC31)', () => {
  it('shows who did what and when, with the short details, and no edit or delete action', async () => {
    renderAt('/admin/audit-logs')

    expect(await screen.findByText('Khóa tài khoản')).toBeInTheDocument()
    expect(screen.getByText('Admin Một')).toBeInTheDocument()
    expect(screen.getByText('Đăng đồ chơi nguy hiểm')).toBeInTheDocument()
    // A system job has no actor.
    expect(screen.getByText('Hệ thống')).toBeInTheDocument()
    expect(screen.getByText('Mở khóa tài khoản')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /xóa|sửa/i })).not.toBeInTheDocument()
    expect(list).toHaveBeenCalledWith({ page: 1, limit: 20 })
  })

  it('shows chat masking and coded detail values in Vietnamese', async () => {
    list.mockResolvedValue({
      items: [
        {
          id: '3',
          action: 'chat.contact_masked',
          actor: { id: '64b000000000000000000002', fullName: 'Người Dùng' },
          targetType: 'MESSAGE',
          targetId: '64b0000000000000000000cc',
          details: null,
          ipAddress: null,
          createdAt: '2026-11-18T04:00:00.000Z',
        },
        {
          id: '5',
          action: 'donation.confirm_received',
          actor: { id: ADMIN_ID, fullName: 'Admin Một' },
          targetType: 'DONATION_REQUEST',
          targetId: '64b0000000000000000000ee',
          details: { from: 'shipping', to: 'completed' },
          ipAddress: null,
          createdAt: '2026-11-18T06:00:00.000Z',
        },
        {
          id: '4',
          action: 'report.lock',
          actor: { id: ADMIN_ID, fullName: 'Admin Một' },
          targetType: 'VIOLATION_REPORT',
          targetId: '64b0000000000000000000dd',
          details: { targetKind: 'toy', reason: 'unsafe_toy', lockDuration: '7d' },
          ipAddress: null,
          createdAt: '2026-11-18T05:00:00.000Z',
        },
      ],
      pagination: { page: 1, limit: 20, totalItems: 3, totalPages: 1, hasNextPage: false, hasPrevPage: false },
    })
    renderAt('/admin/audit-logs')

    expect(await screen.findByText('Che thông tin liên hệ trong tin nhắn')).toBeInTheDocument()
    expect(screen.getByText('Tin nhắn')).toBeInTheDocument()
    expect(screen.getByText('Tin đăng')).toBeInTheDocument()
    expect(screen.getByText('Đồ chơi không an toàn')).toBeInTheDocument()
    expect(screen.getByText('7 ngày')).toBeInTheDocument()
    expect(screen.getByText('Đang bàn giao')).toBeInTheDocument()
    expect(screen.getByText('Hoàn tất')).toBeInTheDocument()
    expect(screen.queryByText('unsafe_toy')).not.toBeInTheDocument()
  })

  // UC29 (FE-09): the three Trust Score decisions are listed in Vietnamese with their details.
  it('shows the Trust Score decisions in Vietnamese', async () => {
    const base = { actor: { id: ADMIN_ID, fullName: 'Admin Một' }, targetType: 'USER' as const, targetId: '64b0000000000000000000ab', ipAddress: null }
    list.mockResolvedValue({
      items: [
        { ...base, id: '11', action: 'user.trust_lift', details: { reason: 'Đã xác minh qua điện thoại', score: 35, threshold: 50, attempts: 2 }, createdAt: '2026-11-25T03:00:00.000Z' },
        { ...base, id: '12', action: 'user.trust_keep', details: { reason: 'Điểm còn thấp', score: 35, threshold: 50, attempts: 0, liftRevoked: true }, createdAt: '2026-11-25T02:00:00.000Z' },
        { ...base, id: '13', action: 'user.trust_lock', details: { reason: 'Cố thuê nhiều lần', duration: '30d', score: 20, threshold: 50, attempts: 4 }, createdAt: '2026-11-25T01:00:00.000Z' },
      ],
      pagination: { page: 1, limit: 20, totalItems: 3, totalPages: 1, hasNextPage: false, hasPrevPage: false },
    })
    renderAt('/admin/audit-logs')

    expect(await screen.findByText('Gỡ chặn Trust Score')).toBeInTheDocument()
    expect(screen.getByText('Giữ chặn Trust Score')).toBeInTheDocument()
    expect(screen.getByText('Xử lý chặn Trust Score: khóa tài khoản')).toBeInTheDocument()
    expect(screen.getAllByText('Điểm tin cậy:')).toHaveLength(3)
    expect(screen.getAllByText('Ngưỡng:')).toHaveLength(3)
    expect(screen.getAllByText('Lượt bị chặn:')).toHaveLength(3)
    expect(screen.getByText('Áp dụng lại sau khi gỡ chặn:')).toBeInTheDocument()
    expect(screen.getByText('30 ngày')).toBeInTheDocument()
    expect(screen.queryByText(/user\.trust_lift:|liftRevoked/)).not.toBeInTheDocument()
  })

  // DEF-ST-28: an Admin wallet credit is listed in Vietnamese with the amount and the note.
  it('shows an Admin wallet credit with its amount and note', async () => {
    list.mockResolvedValue({
      items: [
        {
          id: '6',
          action: 'wallet.credit',
          actor: { id: ADMIN_ID, fullName: 'Admin Một' },
          targetType: 'USER',
          targetId: '64b0000000000000000000ff',
          details: { amount: 250000, note: 'Hoàn tiền sự cố' },
          ipAddress: '10.0.0.1',
          createdAt: '2026-11-18T07:00:00.000Z',
        },
      ],
      pagination: { page: 1, limit: 20, totalItems: 1, totalPages: 1, hasNextPage: false, hasPrevPage: false },
    })
    renderAt('/admin/audit-logs')

    expect(await screen.findByText('Cộng tiền vào ví')).toBeInTheDocument()
    expect(screen.getByText('Tài khoản')).toBeInTheDocument()
    expect(screen.getByText('Số tiền:')).toBeInTheDocument()
    expect(screen.getByText(/250\.000\s₫/)).toBeInTheDocument()
    expect(screen.getByText('Ghi chú:')).toBeInTheDocument()
    expect(screen.getByText('Hoàn tiền sự cố')).toBeInTheDocument()
  })

  it('sends the filters of the URL (actor, action area, time range) to the API', async () => {
    const from = '2026-11-01T00:00:00.000Z'
    const to = '2026-11-18T23:59:59.999Z'
    renderAt(`/admin/audit-logs?actorId=${ADMIN_ID}&action=user&from=${from}&to=${to}`)

    await screen.findByText('Khóa tài khoản')
    expect(list).toHaveBeenCalledWith({ page: 1, limit: 20, actorId: ADMIN_ID, action: 'user', from, to })
    // A broken value is ignored instead of breaking the page.
    expect(screen.getByRole('button', { name: 'Xóa bộ lọc' })).toBeInTheDocument()
  })

  // DEF-ST-29: the two filter lists match what an Admin types without accents, in any case,
  // with spaces around it, and with đ typed as d.
  describe('filter lists typed without accents', () => {
    const OTHER_ADMIN_ID = '64b000000000000000000003'
    const optionTitles = () =>
      Array.from(document.querySelectorAll('.ant-select-item-option')).map((option) => option.getAttribute('title'))
    const search = (box: HTMLElement, text: string) => fireEvent.change(box, { target: { value: text } })

    beforeEach(() => {
      filters.mockResolvedValue({
        actions: ['category.delete', 'donation.confirm_received', 'user.lock', 'user.unlock'],
        actors: [
          { id: ADMIN_ID, fullName: 'Admin Một' },
          { id: OTHER_ADMIN_ID, fullName: 'Đỗ Văn Đạt' },
        ],
      })
    })

    it('finds an action type', async () => {
      renderAt('/admin/audit-logs')
      const user = userEvent.setup()
      const action = await screen.findByRole('combobox', { name: 'Loại thao tác' })
      await user.click(action)

      search(action, 'khoa tai khoan')
      expect(await screen.findByTitle('Khóa tài khoản')).toBeInTheDocument()
      expect(optionTitles()).toEqual(['Khóa tài khoản', 'Mở khóa tài khoản'])

      search(action, '  XÁC NHẬN  ')
      expect(await screen.findByTitle('Xác nhận đã nhận')).toBeInTheDocument()
      expect(optionTitles()).toEqual(['Xác nhận đã nhận'])

      search(action, 'xoa danh muc')
      await user.click(await screen.findByTitle('Xóa danh mục'))
      expect(list).toHaveBeenLastCalledWith({ page: 1, limit: 20, action: 'category.delete' })
    }, 15_000)

    it('finds an actor', async () => {
      renderAt('/admin/audit-logs')
      const user = userEvent.setup()
      const actor = await screen.findByRole('combobox', { name: 'Người thực hiện' })
      await user.click(actor)

      search(actor, ' admin mot ')
      expect(await screen.findByTitle('Admin Một')).toBeInTheDocument()
      expect(optionTitles()).toEqual(['Admin Một'])

      search(actor, 'DO VAN DAT')
      await user.click(await screen.findByTitle('Đỗ Văn Đạt'))
      expect(list).toHaveBeenLastCalledWith({ page: 1, limit: 20, actorId: OTHER_ADMIN_ID })
    }, 15_000)
  })
})
