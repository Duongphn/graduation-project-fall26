import { screen } from '@testing-library/react'
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

  it('sends the filters of the URL (actor, action area, time range) to the API', async () => {
    const from = '2026-11-01T00:00:00.000Z'
    const to = '2026-11-18T23:59:59.999Z'
    renderAt(`/admin/audit-logs?actorId=${ADMIN_ID}&action=user&from=${from}&to=${to}`)

    await screen.findByText('Khóa tài khoản')
    expect(list).toHaveBeenCalledWith({ page: 1, limit: 20, actorId: ADMIN_ID, action: 'user', from, to })
    // A broken value is ignored instead of breaking the page.
    expect(screen.getByRole('button', { name: 'Xóa bộ lọc' })).toBeInTheDocument()
  })
})
