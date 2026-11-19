import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AdminLayout } from '../../components/layout/AdminLayout'
import { NotificationMenu } from '../../layouts/site/notification-menu'
import { renderWithProviders } from '../../test/render'
import { NotificationsPanel } from './components/NotificationsPanel'
import { notificationsApi, type AppNotification, type NotificationPreferences } from './notifications-api'

// A fake Socket.IO client: the test plays the server's events.
const fake = vi.hoisted(() => {
  const listeners = new Map<string, (payload?: unknown) => void>()
  const socket = {
    connected: false,
    active: false,
    auth: undefined as unknown,
    on(event: string, listener: (payload?: unknown) => void) {
      listeners.set(event, listener)
      return socket
    },
    connect() {
      socket.connected = true
      socket.active = true
      listeners.get('connect')?.()
      return socket
    },
    disconnect() {
      socket.connected = false
      socket.active = false
      return socket
    },
    removeAllListeners() {
      listeners.clear()
      return socket
    },
  }
  return {
    socket,
    emit: (event: string, payload?: unknown) => listeners.get(event)?.(payload),
    io: (_url: string, options: { auth: unknown }) => {
      socket.auth = options.auth
      return socket
    },
  }
})
vi.mock('socket.io-client', () => ({ io: fake.io }))

vi.mock('./notifications-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./notifications-api')>()),
  notificationsApi: {
    list: vi.fn(),
    unreadCount: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    preferences: vi.fn(),
    savePreferences: vi.fn(),
  },
}))

// Pending counters of the admin menu are not part of these tests.
vi.mock('../../components/layout/useAdminPendingCounts', () => ({ useAdminPendingCounts: () => ({}) }))

const api = vi.mocked(notificationsApi)

const notification = (overrides: Partial<AppNotification> = {}): AppNotification => ({
  id: 'n1',
  type: 'RENTAL_ORDER',
  title: 'Yêu cầu thuê mới',
  body: 'Bạn nhận được yêu cầu thuê mới cho đồ chơi Tàu hỏa.',
  link: '/rentals/requests/o1',
  isRead: false,
  createdAt: new Date().toISOString(),
  ...overrides,
})

const page = (items: AppNotification[], totalItems = items.length, pageNo = 1) => ({
  items,
  pagination: {
    page: pageNo,
    limit: 10,
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / 10)),
    hasNextPage: pageNo * 10 < totalItems,
    hasPrevPage: pageNo > 1,
  },
})

const preferences: NotificationPreferences = {
  types: [
    { type: 'RENTAL_ORDER', canMute: false, muted: false, email: false },
    { type: 'DISPUTE', canMute: false, muted: false, email: true },
    { type: 'CHAT_MESSAGE', canMute: true, muted: false, email: false },
    { type: 'VOUCHER', canMute: true, muted: true, email: false },
  ],
}

// A token whose payload holds the userId (the socket joins this user's room).
const token = `x.${btoa(JSON.stringify({ userId: 'u1', role: 'USER' }))}.y`

const renderAt = (element: React.ReactNode, path = '/') => {
  const router = createMemoryRouter(
    [
      { path: '/', element },
      { path: '/rentals/requests/:id', element: <p>Trang yêu cầu thuê</p> },
      { path: '/notifications', element: <p>Trang thông báo</p> },
      { path: '/admin', element: <AdminLayout />, children: [{ index: true, element: <p>Trang quản trị</p> }] },
      { path: '/admin/notifications', element: <p>Thông báo của Admin</p> },
    ],
    { initialEntries: [path] },
  )
  return { router, ...renderWithProviders(<RouterProvider router={router} />) }
}

beforeEach(() => {
  localStorage.setItem('toyflow-access-token', token)
  api.unreadCount.mockResolvedValue({ count: 3 })
  api.list.mockResolvedValue(page([notification()]))
  api.markRead.mockResolvedValue(notification({ isRead: true }))
  api.markAllRead.mockResolvedValue({ updatedCount: 3 })
  api.preferences.mockResolvedValue(preferences)
  api.savePreferences.mockImplementation(async (mutedTypes) => ({
    types: preferences.types.map((item) => ({ ...item, muted: mutedTypes.includes(item.type) })),
  }))
})

afterEach(() => {
  localStorage.clear()
})

describe('NotificationMenu (the bell)', () => {
  it('shows the unread count, opens the target and marks it read', async () => {
    const user = userEvent.setup()
    const { router } = renderAt(<NotificationMenu />)

    const bell = await screen.findByRole('button', { name: 'Thông báo, 3 chưa đọc' })
    await user.click(bell)
    await user.click(await screen.findByRole('button', { name: /Yêu cầu thuê mới/ }))

    expect(api.markRead).toHaveBeenCalledWith('n1')
    expect(await screen.findByText('Trang yêu cầu thuê')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/rentals/requests/o1')
  })

  it('marks every notification read and links to the full list', async () => {
    const user = userEvent.setup()
    renderAt(<NotificationMenu />)

    await user.click(await screen.findByRole('button', { name: 'Thông báo, 3 chưa đọc' }))
    await user.click(await screen.findByRole('button', { name: /Đánh dấu đã đọc tất cả/ }))
    expect(api.markAllRead).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('link', { name: 'Xem tất cả thông báo' })).toHaveAttribute('href', '/notifications')
  })

  it('updates the badge from a pushed notification and reloads after a reconnect', async () => {
    renderAt(<NotificationMenu />)
    await screen.findByRole('button', { name: 'Thông báo, 3 chưa đọc' })

    // The handshake sends the stored access token.
    const send = vi.fn()
    ;(fake.socket.auth as (cb: (data: unknown) => void) => void)(send)
    expect(send).toHaveBeenCalledWith({ token })

    act(() => fake.emit('notification:new', { notification: notification({ id: 'n2' }), unreadCount: 4 }))
    expect(await screen.findByRole('button', { name: 'Thông báo, 4 chưa đọc' })).toBeInTheDocument()

    act(() => fake.emit('notification:unread-count', { count: 0 }))
    expect(await screen.findByRole('button', { name: 'Thông báo' })).toBeInTheDocument()

    const calls = api.unreadCount.mock.calls.length
    api.unreadCount.mockResolvedValue({ count: 7 })
    act(() => fake.emit('connect'))
    await waitFor(() => expect(api.unreadCount.mock.calls.length).toBeGreaterThan(calls))
    expect(await screen.findByRole('button', { name: 'Thông báo, 7 chưa đọc' })).toBeInTheDocument()
  })
})

describe('NotificationsPanel (the full list)', () => {
  it('pages through the feed and filters the unread ones', async () => {
    const user = userEvent.setup()
    api.list.mockImplementation(async (params) =>
      page([notification({ id: `p${params.page}`, title: `Thông báo trang ${params.page}` })], 12, params.page),
    )
    renderAt(<NotificationsPanel />)

    expect(await screen.findByText('Thông báo trang 1')).toBeInTheDocument()
    await user.click(screen.getByTitle('2'))
    expect(await screen.findByText('Thông báo trang 2')).toBeInTheDocument()

    await user.click(screen.getByText(/Chưa đọc \(3\)/))
    await waitFor(() =>
      expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, unreadOnly: 'true' })),
    )
  })

  it('turns off only the types that can be muted', async () => {
    const user = userEvent.setup()
    renderAt(<NotificationsPanel />)

    const chat = await screen.findByRole('switch', { name: 'Tin nhắn' })
    expect(chat).toBeChecked()
    expect(screen.getByRole('switch', { name: 'Mã giảm giá' })).not.toBeChecked()
    // Important types have no switch: they are always delivered.
    expect(screen.queryByRole('switch', { name: 'Khiếu nại' })).not.toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: 'Đơn thuê' })).not.toBeInTheDocument()

    await user.click(chat)
    expect(api.savePreferences).toHaveBeenCalledWith(['VOUCHER', 'CHAT_MESSAGE'])
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Tin nhắn' })).not.toBeChecked())
  })
})

describe('AdminLayout', () => {
  // The whole admin shell renders here, which is slow under a full parallel test run.
  it('shows the bell to Admins, with the Admin list page', async () => {
    const user = userEvent.setup()
    renderAt(null, '/admin')

    const header = (await screen.findByText('Trang quản trị')).closest('.ant-layout') as HTMLElement
    await user.click(await within(header).findByRole('button', { name: 'Thông báo, 3 chưa đọc' }))
    expect(await screen.findByRole('link', { name: 'Xem tất cả thông báo' })).toHaveAttribute(
      'href',
      '/admin/notifications',
    )
  }, 15_000)
})
