import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { profileQuery } from '../profile/profile-queries'
import { OwnerCard } from '../../pages/toy-detail-page'
import { ChatMenu } from '../../layouts/site/chat-menu'
import { createTestQueryClient, deferred, renderWithProviders } from '../../test/render'
import { chatApi, type ChatMessage, type Conversation, type MessagesPage } from './chat-api'
import { MASKED_NOTICE } from './components/message-bubble'
import { ChatRoom } from './components/chat-room'

// A fake Socket.IO client: the test plays the server, answering acks and pushing events.
const fake = vi.hoisted(() => {
  type Listener = (payload?: unknown) => void
  const listeners = new Map<string, Set<Listener>>()
  const server = new Map<string, (payload: unknown) => unknown>()
  const emitted: { event: string; payload: unknown }[] = []
  const socket = {
    connected: false,
    active: false,
    on(event: string, listener: Listener) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)?.add(listener)
      return socket
    },
    connect() {
      socket.connected = true
      socket.active = true
      listeners.get('connect')?.forEach((listener) => listener())
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
    timeout() {
      return {
        emit(event: string, payload: unknown, callback: (error: Error | null, result: unknown) => void) {
          emitted.push({ event, payload })
          void Promise.resolve(server.get(event)?.(payload)).then((result) => callback(null, result))
        },
      }
    },
  }
  return {
    socket,
    server,
    emitted,
    push: (event: string, payload: unknown) => listeners.get(event)?.forEach((listener) => listener(payload)),
    io: () => socket,
  }
})
vi.mock('socket.io-client', () => ({ io: fake.io }))

vi.mock('./chat-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./chat-api')>()),
  chatApi: {
    open: vi.fn(),
    list: vi.fn(),
    unreadCount: vi.fn(),
    get: vi.fn(),
    messages: vi.fn(),
    send: vi.fn(),
    markRead: vi.fn(),
  },
}))

const api = vi.mocked(chatApi)
const ME = '64a000000000000000000001'
const THEM = '64a000000000000000000002'
const ROOM = '64c000000000000000000001'
const token = `x.${btoa(JSON.stringify({ userId: ME, role: 'USER' }))}.y`

const conversation = (overrides: Partial<Conversation> = {}): Conversation => ({
  id: ROOM,
  subject: { kind: 'RENTAL_ORDER', id: '64d000000000000000000001', code: 'RO-20261118-0001', status: 'IN_USE' },
  toy: { id: '64b000000000000000000001', title: 'Bộ Lego Thành phố', imageUrl: null },
  counterpart: { id: THEM, fullName: 'Nguyễn Thị Lan', avatarUrl: null },
  lastMessage: null,
  unreadCount: 0,
  readOnly: false,
  closesAt: null,
  createdAt: '2026-11-20T08:00:00.000Z',
  ...overrides,
})

let sequence = 0
const message = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: `64e0000000000000000${String(++sequence).padStart(5, '0')}`,
  conversationId: ROOM,
  senderId: THEM,
  text: 'Xin chào',
  images: [],
  masked: false,
  maskedKinds: [],
  isRead: true,
  readAt: null,
  createdAt: '2026-11-25T08:00:00.000Z',
  ...overrides,
})

const pageOf = (items: ChatMessage[], nextCursor: string | null = null): MessagesPage => ({
  items,
  hasMore: nextCursor !== null,
  nextCursor,
})

const renderRoom = () =>
  renderWithProviders(
    <MemoryRouter>
      <ChatRoom conversationId={ROOM} />
    </MemoryRouter>,
  )

const composer = () => screen.getByRole('textbox', { name: 'Nội dung tin nhắn' })
const sends = () => fake.emitted.filter((item) => item.event === 'chat:send')

beforeEach(() => {
  localStorage.setItem('toyflow-access-token', token)
  fake.emitted.length = 0
  fake.server.clear()
  fake.server.set('chat:join', () => ({ ok: true, data: conversation() }))
  fake.server.set('chat:leave', () => ({ ok: true, data: null }))
  fake.server.set('chat:read', () => ({ ok: true, data: { updatedCount: 1, readAt: '2026-11-25T09:00:00.000Z' } }))
  api.get.mockResolvedValue(conversation())
  api.messages.mockResolvedValue(pageOf([message({ text: 'Bạn còn bộ này không?' })]))
  api.unreadCount.mockResolvedValue({ count: 0 })
})

afterEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

describe('ChatRoom: loading messages', () => {
  it('loads the 50 latest messages, then older ones before the cursor, oldest first', async () => {
    api.messages.mockImplementation(async (_id, params) =>
      params.before
        ? pageOf([message({ text: 'Tin cũ 1' }), message({ text: 'Tin cũ 2' })])
        : pageOf([message({ text: 'Tin mới 1' }), message({ text: 'Tin mới 2' })], 'cursor-1'),
    )
    renderRoom()

    expect(await screen.findByText('Tin mới 2')).toBeInTheDocument()
    expect(api.messages).toHaveBeenCalledWith(ROOM, { limit: 50 })

    await userEvent.setup().click(screen.getByRole('button', { name: 'Xem tin nhắn cũ hơn' }))
    expect(await screen.findByText('Tin cũ 1')).toBeInTheDocument()
    expect(api.messages).toHaveBeenLastCalledWith(ROOM, { limit: 50, before: 'cursor-1' })

    const texts = within(screen.getByRole('list', { name: 'Tin nhắn' }))
      .getAllByText(/^Tin (cũ|mới) \d$/)
      .map((element) => element.textContent)
    expect(texts).toEqual(['Tin cũ 1', 'Tin cũ 2', 'Tin mới 1', 'Tin mới 2'])
    expect(screen.queryByRole('button', { name: 'Xem tin nhắn cũ hơn' })).not.toBeInTheDocument()
  })

  it('marks unread messages as read over the socket when the room opens', async () => {
    api.messages.mockResolvedValue(pageOf([message({ isRead: false })]))
    renderRoom()

    await waitFor(() =>
      expect(fake.emitted).toContainEqual({ event: 'chat:read', payload: { conversationId: ROOM } }),
    )
  })

  it('shows MSG41 under a message whose contact details were hidden', async () => {
    api.messages.mockResolvedValue(pageOf([message({ text: 'Gọi mình số *** nhé', masked: true, maskedKinds: ['PHONE'] })]))
    renderRoom()

    expect(await screen.findByText('Gọi mình số *** nhé')).toBeInTheDocument()
    expect(screen.getByText(MASKED_NOTICE)).toBeInTheDocument()
  })

  it('shows "Đã xem" when the other party reads my messages', async () => {
    api.messages.mockResolvedValue(pageOf([message({ senderId: ME, text: 'Mai mình giao nhé', isRead: false })]))
    renderRoom()
    await screen.findByText('Mai mình giao nhé')
    expect(screen.queryByText(/Đã xem/)).not.toBeInTheDocument()

    act(() => fake.push('chat:read', { conversationId: ROOM, readerId: THEM, readAt: '2026-11-25T09:00:00.000Z' }))
    expect(await screen.findByText(/Đã xem/)).toBeInTheDocument()
  })
})

describe('ChatRoom: sending', () => {
  it('shows the message while sending, replaces it with the saved one and ignores the echo', async () => {
    const ack = deferred<unknown>()
    fake.server.set('chat:send', () => ack.promise)
    renderRoom()
    const user = userEvent.setup()
    await screen.findByText('Bạn còn bộ này không?')

    await user.type(composer(), 'Còn bạn nhé{Enter}')

    expect(sends()).toEqual([{ event: 'chat:send', payload: { conversationId: ROOM, text: 'Còn bạn nhé' } }])
    expect(screen.getByText('Đang gửi…')).toBeInTheDocument()
    expect(composer()).toHaveValue('')

    const saved = message({ senderId: ME, text: 'Còn bạn nhé', isRead: false })
    await act(async () => ack.resolve({ ok: true, data: saved }))
    await waitFor(() => expect(screen.queryByText('Đang gửi…')).not.toBeInTheDocument())

    // The server pushes my own message back to me too: shown once. React Query notifies the
    // screen on a later tick, so wait for a following message before counting.
    act(() => {
      fake.push('chat:message', { conversationId: ROOM, message: saved })
      fake.push('chat:message', { conversationId: ROOM, message: message({ text: 'Tuyệt, cảm ơn bạn' }) })
    })
    expect(await screen.findByText('Tuyệt, cảm ơn bạn')).toBeInTheDocument()
    expect(screen.getAllByText('Còn bạn nhé')).toHaveLength(1)
  })

  it('keeps Shift+Enter as a new line and refuses a message over 1000 characters', async () => {
    renderRoom()
    const user = userEvent.setup()
    await screen.findByText('Bạn còn bộ này không?')

    await user.type(composer(), 'Dòng 1{Shift>}{Enter}{/Shift}Dòng 2')
    expect(composer()).toHaveValue('Dòng 1\nDòng 2')
    expect(sends()).toHaveLength(0)

    await user.clear(composer())
    await user.click(composer())
    await user.paste('a'.repeat(1001))
    expect(screen.getByText('1001/1000')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gửi tin nhắn' })).toBeDisabled()
  })

  it('offers to retry a message the server refused', async () => {
    let attempts = 0
    fake.server.set('chat:send', () =>
      ++attempts === 1
        ? { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Dữ liệu yêu cầu không hợp lệ.' } }
        : { ok: true, data: message({ senderId: ME, text: 'Thử lại nè' }) },
    )
    renderRoom()
    const user = userEvent.setup()
    await screen.findByText('Bạn còn bộ này không?')

    await user.type(composer(), 'Thử lại nè{Enter}')
    expect(await screen.findByText('Gửi lỗi: Dữ liệu yêu cầu không hợp lệ.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Thử lại' }))
    await waitFor(() => expect(screen.queryByText(/Gửi lỗi/)).not.toBeInTheDocument())
    expect(sends()).toHaveLength(2)
    expect(screen.getByText('Thử lại nè')).toBeInTheDocument()
  })

  it('sends over REST when the realtime connection is down', async () => {
    renderRoom()
    const user = userEvent.setup()
    await screen.findByText('Bạn còn bộ này không?')
    act(() => {
      fake.socket.connected = false
      fake.push('disconnect', undefined)
    })
    api.send.mockResolvedValue(message({ senderId: ME, text: 'Gửi qua REST' }))

    await user.type(composer(), 'Gửi qua REST{Enter}')

    await waitFor(() => expect(api.send).toHaveBeenCalledWith(ROOM, { text: 'Gửi qua REST' }))
    expect(sends()).toHaveLength(0)
    expect(await screen.findByText('Gửi qua REST')).toBeInTheDocument()
    act(() => {
      fake.socket.connected = true
      fake.push('connect', undefined)
    })
  })
})

describe('ChatRoom: read-only', () => {
  it('hides the composer of a closed order chat', async () => {
    api.get.mockResolvedValue(conversation({ readOnly: true }))
    fake.server.set('chat:join', () => ({ ok: true, data: conversation({ readOnly: true }) }))
    renderRoom()

    expect(await screen.findByText('Đơn đã kết thúc, cuộc trò chuyện chỉ còn xem được.')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Nội dung tin nhắn' })).not.toBeInTheDocument()
  })

  it('warns when an ended order chat will close', async () => {
    const closesAt = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString()
    api.get.mockResolvedValue(conversation({ closesAt }))
    fake.server.set('chat:join', () => ({ ok: true, data: conversation({ closesAt }) }))
    renderRoom()

    expect(await screen.findByText(/Cuộc trò chuyện sẽ đóng vào/)).toBeInTheDocument()
    expect(composer()).toBeInTheDocument()
  })

  it('switches to read-only as soon as the server answers CHAT_CLOSED', async () => {
    fake.server.set('chat:send', () => {
      api.get.mockResolvedValue(conversation({ readOnly: true }))
      return { ok: false, error: { code: 'CHAT_CLOSED', message: 'Đơn đã kết thúc nên cuộc trò chuyện chỉ còn xem được.' } }
    })
    renderRoom()
    const user = userEvent.setup()
    await screen.findByText('Bạn còn bộ này không?')

    await user.type(composer(), 'Còn ai không?{Enter}')

    expect(await screen.findByText('Đơn đã kết thúc, cuộc trò chuyện chỉ còn xem được.')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Nội dung tin nhắn' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument()
  })
})

describe('Opening a chat from a listing', () => {
  const toy = {
    id: '64b000000000000000000001',
    owner: { id: THEM, displayName: 'Nguyễn Thị Lan' },
  } as Parameters<typeof OwnerCard>[0]['toy']

  const renderOwnerCard = (viewerId: string) => {
    const queryClient = createTestQueryClient()
    queryClient.setQueryData(profileQuery.queryKey, { id: viewerId } as never)
    return renderWithProviders(
      <MemoryRouter initialEntries={['/toys/1']}>
        <Routes>
          <Route path="/toys/1" element={<OwnerCard toy={toy} />} />
          <Route path="/chat/:conversationId" element={<p>Phòng chat mở</p>} />
        </Routes>
      </MemoryRouter>,
      queryClient,
    )
  }

  it('opens the listing chat and goes to the room', async () => {
    api.open.mockResolvedValue({ conversation: conversation({ subject: { kind: 'TOY', id: toy.id, code: null, status: null } }), created: true })
    renderOwnerCard(ME)

    await userEvent.setup().click(screen.getByRole('button', { name: 'Nhắn tin' }))

    expect(api.open).toHaveBeenCalledWith('TOY', toy.id)
    expect(await screen.findByText('Phòng chat mở')).toBeInTheDocument()
  })

  it('hides the button from the owner of the listing', () => {
    renderOwnerCard(THEM)
    expect(screen.queryByRole('button', { name: 'Nhắn tin' })).not.toBeInTheDocument()
  })
})

describe('ChatMenu', () => {
  it('shows the unread count and refreshes it when a message arrives', async () => {
    api.unreadCount.mockResolvedValue({ count: 2 })
    renderWithProviders(
      <MemoryRouter>
        <ChatMenu />
      </MemoryRouter>,
    )
    expect(await screen.findByRole('link', { name: 'Tin nhắn, 2 chưa đọc' })).toHaveAttribute('href', '/chat')

    api.unreadCount.mockResolvedValue({ count: 3 })
    act(() => fake.push('chat:message', { conversationId: ROOM, message: message() }))
    expect(await screen.findByRole('link', { name: 'Tin nhắn, 3 chưa đọc' })).toBeInTheDocument()
  })
})
