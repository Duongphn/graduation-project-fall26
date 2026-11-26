import { fireEvent, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import { auditLogsApi } from '../api'
import { AuditLogPage } from './AuditLogPage'

// DEF-ST-55 (R03 IV.1.1): the audit log shows Vietnam time on a device in New York (UTC−5).
// The time zone is set before the modules load.
const previousTz = vi.hoisted(() => {
  const previous = process.env.TZ
  process.env.TZ = 'America/New_York'
  return previous
})

afterAll(() => {
  if (previousTz === undefined) delete process.env.TZ
  else process.env.TZ = previousTz
})

vi.mock('../api', () => ({ auditLogsApi: { list: vi.fn(), filters: vi.fn() } }))

const list = vi.mocked(auditLogsApi.list)
const filters = vi.mocked(auditLogsApi.filters)

const renderAt = (url: string) => {
  const router = createMemoryRouter([{ path: '/admin/audit-logs', element: <AuditLogPage /> }], {
    initialEntries: [url],
  })
  renderWithProviders(<RouterProvider router={router} />)
}

beforeEach(() => {
  list.mockResolvedValue({
    items: [
      {
        id: '1',
        action: 'user.lock',
        actor: { id: '64b000000000000000000001', fullName: 'Admin Một' },
        targetType: 'USER',
        targetId: '64b0000000000000000000aa',
        // 13:42 UTC = 20:42 in Vietnam = 08:42 in New York
        details: { duration: '7d', until: '2026-11-29T13:42:37.000Z' },
        ipAddress: null,
        createdAt: '2026-11-22T13:42:37.000Z',
      },
    ],
    pagination: { page: 1, limit: 20, totalItems: 1, totalPages: 1, hasNextPage: false, hasPrevPage: false },
  })
  filters.mockResolvedValue({ actions: ['user.lock'], actors: [] })
})

describe('AuditLogPage on a device in New York', () => {
  it('shows the time of an entry and the lock end in Vietnam time', async () => {
    expect(new Date('2026-11-22T13:42:37.000Z').getHours()).toBe(8)
    renderAt('/admin/audit-logs')

    expect(await screen.findByText('20:42:37 22/11/2026')).toBeInTheDocument()
    expect(screen.getByText('20:42 29/11/2026')).toBeInTheDocument()
    expect(screen.queryByText(/08:42/)).not.toBeInTheDocument()
  })

  it('filters by Vietnam days and shows them in the date range', async () => {
    // 21/11 17:00 UTC is 22/11 00:00 in Vietnam (still 21/11 noon in New York).
    renderAt('/admin/audit-logs?from=2026-11-21T17:00:00.000Z&to=2026-11-22T16:59:59.999Z')
    await screen.findByText('Khóa tài khoản')
    const from = screen.getByPlaceholderText('Từ ngày')
    const to = screen.getByPlaceholderText('Đến ngày')
    expect(from).toHaveValue('22/11/2026')
    expect(to).toHaveValue('22/11/2026')

    fireEvent.mouseDown(from)
    fireEvent.focus(from)
    fireEvent.change(from, { target: { value: '20/11/2026' } })
    fireEvent.keyDown(from, { key: 'Enter' })
    fireEvent.change(to, { target: { value: '21/11/2026' } })
    fireEvent.keyDown(to, { key: 'Enter' })

    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith({
        page: 1,
        limit: 20,
        from: '2026-11-19T17:00:00.000Z',
        to: '2026-11-21T16:59:59.999Z',
      }),
    )
  }, 15_000)
})
