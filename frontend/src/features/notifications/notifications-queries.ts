import { queryOptions } from '@tanstack/react-query'

import { useApiMutation } from '../../hooks/useApiMutation'
import { notificationsApi } from './notifications-api'

export const NOTIFICATION_PAGE_SIZE = 10
const UNREAD_POLL_MS = 30_000

export const notificationKeys = {
  all: ['notifications'] as const,
  list: () => [...notificationKeys.all, 'list'] as const,
  unreadCount: () => [...notificationKeys.all, 'unread-count'] as const,
}

/** Số thông báo chưa đọc trên chuông: hỏi lại mỗi 30 giây và khi quay lại tab */
export const unreadCountQuery = queryOptions({
  queryKey: notificationKeys.unreadCount(),
  queryFn: notificationsApi.unreadCount,
  refetchInterval: UNREAD_POLL_MS,
  refetchOnWindowFocus: true,
  retry: false,
})

/** 10 thông báo mới nhất, chỉ tải khi mở chuông */
export const latestNotificationsQuery = queryOptions({
  queryKey: notificationKeys.list(),
  queryFn: () =>
    notificationsApi.list({ page: 1, limit: NOTIFICATION_PAGE_SIZE, sortBy: 'createdAt', sortOrder: 'desc' }),
  staleTime: 0,
  retry: false,
})

const invalidate = [notificationKeys.all]

export const useMarkNotificationRead = () =>
  useApiMutation({ mutationFn: (id: string) => notificationsApi.markRead(id), invalidate })

export const useMarkAllNotificationsRead = () =>
  useApiMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    successMessage: 'Đã đánh dấu tất cả thông báo là đã đọc.',
    invalidate,
  })
