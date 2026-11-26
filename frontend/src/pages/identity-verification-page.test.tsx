import { act, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ThemeProvider } from '../contexts/theme-provider'
import type { NotificationSocketHandlers } from '../features/notifications/notification-socket'
import type { LatestVerification, UserProfile } from '../features/profile/profile-api'
import { httpClient } from '../services/http-client'
import { renderWithProviders } from '../test/render'
import { IdentityVerificationPage } from './identity-verification-page'

vi.mock('../services/http-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/http-client')>()),
  httpClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

// Socket.IO giả: test tự phát sự kiện thông báo mới
const socketHandlers = new Set<NotificationSocketHandlers>()
vi.mock('../features/notifications/notification-socket', () => ({
  subscribeNotificationSocket: (handler: NotificationSocketHandlers) => {
    socketHandlers.add(handler)
    return () => socketHandlers.delete(handler)
  },
}))

const get = vi.mocked(httpClient.get)
const ok = <T,>(data: T) => ({ data: { success: true, data } }) as never

const PROFILE: UserProfile = {
  id: 'u1',
  fullName: 'Nộp Hồ Sơ',
  email: 'kyc@example.com',
  phone: '0912345678',
  dateOfBirth: null,
  gender: null,
  bio: null,
  trustScore: 100,
  memberSince: '2026-11-01T00:00:00.000Z',
  verificationStatus: 'pending',
  role: 'USER',
}
const PENDING: LatestVerification = {
  id: 'v1',
  status: 'pending',
  submittedAt: '2026-11-20T03:00:00.000Z',
  rejectionReason: null,
  reviewedAt: null,
  documents: {
    frontImage: 'https://res.cloudinary.com/x/front.png?sig=1',
    backImage: 'https://res.cloudinary.com/x/back.png?sig=1',
    selfie: 'https://res.cloudinary.com/x/selfie.png?sig=1',
  },
}

const serve = (profile: UserProfile, latest: LatestVerification) =>
  get.mockImplementation(async (url: string) => {
    if (url === '/users/profile') return ok(profile)
    if (url === '/identity-verifications/my-latest') return ok(latest)
    throw new Error(`unexpected ${url}`)
  })

const renderPage = () =>
  renderWithProviders(
    <ThemeProvider>
      <MemoryRouter>
        <IdentityVerificationPage />
      </MemoryRouter>
    </ThemeProvider>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  socketHandlers.clear()
})

describe('Trang xác minh danh tính khi Chờ duyệt (R03 III.6.1.2 (7))', () => {
  it('hiện lại 3 ảnh đã gửi, chỉ xem, không có form nộp', async () => {
    serve(PROFILE, PENDING)
    renderPage()

    const submitted = await screen.findByRole('region', { name: 'Ảnh đã gửi' })
    expect(within(submitted).getByRole('img', { name: 'CCCD mặt trước' })).toHaveAttribute('src', PENDING.documents!.frontImage)
    expect(within(submitted).getByRole('img', { name: 'CCCD mặt sau' })).toHaveAttribute('src', PENDING.documents!.backImage)
    expect(within(submitted).getByRole('img', { name: 'Ảnh chân dung' })).toHaveAttribute('src', PENDING.documents!.selfie)
    expect(screen.queryByRole('button', { name: /Gửi hồ sơ xác minh/ })).toBeNull()
  })

  it('Admin duyệt (thông báo IDENTITY_REVIEWED) → trang tự chuyển sang Đã xác minh, không cần tải lại', async () => {
    serve(PROFILE, PENDING)
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Hồ sơ đang chờ duyệt' })).toBeInTheDocument()

    serve(
      { ...PROFILE, verificationStatus: 'verified' },
      { ...PENDING, status: 'verified', reviewedAt: '2026-11-20T04:00:00.000Z', documents: undefined },
    )
    act(() =>
      socketHandlers.forEach((handler) =>
        handler.onNew({
          notification: {
            id: 'n1',
            type: 'IDENTITY_REVIEWED',
            title: 'Tài khoản đã được xác minh',
            body: '',
            isRead: false,
            createdAt: '2026-11-20T04:00:00.000Z',
          } as never,
          unreadCount: 1,
        }),
      ),
    )

    expect(await screen.findByRole('heading', { name: 'Tài khoản đã được xác minh' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Ảnh đã gửi' })).toBeNull()
  })
})
