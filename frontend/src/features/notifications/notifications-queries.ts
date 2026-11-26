import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useSyncExternalStore } from 'react'

import { useApiMutation } from '../../hooks/useApiMutation'
import { useIsSignedIn } from '../../hooks/use-is-signed-in'
import {
  isNotificationSocketConnected,
  subscribeNotificationSocket,
  subscribeSocketStatus,
} from './notification-socket'
import { notificationsApi, type NotificationListParams, type NotificationType } from './notifications-api'

export const NOTIFICATION_PAGE_SIZE = 10
/** Chỉ hỏi lại định kỳ khi chưa có kết nối realtime */
export const UNREAD_POLL_MS = 30_000

export const notificationKeys = {
  all: ['notifications'] as const,
  lists: () => [...notificationKeys.all, 'list'] as const,
  list: (params: NotificationListParams) => [...notificationKeys.lists(), params] as const,
  unreadCount: () => [...notificationKeys.all, 'unread-count'] as const,
  preferences: () => [...notificationKeys.all, 'preferences'] as const,
}

const latestParams: NotificationListParams = {
  page: 1,
  limit: NOTIFICATION_PAGE_SIZE,
  sortBy: 'createdAt',
  sortOrder: 'desc',
}

/** Số thông báo chưa đọc trên chuông */
export const unreadCountQuery = queryOptions({
  queryKey: notificationKeys.unreadCount(),
  queryFn: notificationsApi.unreadCount,
  refetchOnWindowFocus: true,
  retry: false,
})

/** 10 thông báo mới nhất, chỉ tải khi mở chuông */
export const latestNotificationsQuery = queryOptions({
  queryKey: notificationKeys.list(latestParams),
  queryFn: () => notificationsApi.list(latestParams),
  staleTime: 0,
  retry: false,
})

/** Một trang của danh sách đầy đủ (trang Thông báo) */
export const notificationsPageQuery = (page: number, unreadOnly: boolean) => {
  const params: NotificationListParams = {
    ...latestParams,
    page,
    ...(unreadOnly ? { unreadOnly: 'true' as const } : {}),
  }
  return queryOptions({
    queryKey: notificationKeys.list(params),
    queryFn: () => notificationsApi.list(params),
    staleTime: 0,
  })
}

export const notificationPreferencesQuery = queryOptions({
  queryKey: notificationKeys.preferences(),
  queryFn: notificationsApi.preferences,
})

/**
 * Nghe thông báo realtime (Socket.IO): số chưa đọc cập nhật ngay, danh sách được tải lại.
 * Trả về đã kết nối hay chưa, để chỉ hỏi lại định kỳ khi chưa có kết nối.
 */
export function useNotificationRealtime(): boolean {
  const queryClient = useQueryClient()

  useEffect(
    () =>
      subscribeNotificationSocket({
        onNew: ({ unreadCount }) => {
          queryClient.setQueryData(notificationKeys.unreadCount(), { count: unreadCount })
          void queryClient.invalidateQueries({ queryKey: notificationKeys.lists() })
        },
        onUnreadCount: (count) => {
          queryClient.setQueryData(notificationKeys.unreadCount(), { count })
          void queryClient.invalidateQueries({ queryKey: notificationKeys.lists() })
        },
        onReconnect: () => {
          void queryClient.invalidateQueries({ queryKey: notificationKeys.lists() })
          void queryClient.invalidateQueries({ queryKey: notificationKeys.unreadCount() })
        },
      }),
    [queryClient],
  )

  return useSyncExternalStore(subscribeSocketStatus, isNotificationSocketConnected)
}

/**
 * Số chưa đọc: đẩy qua Socket.IO, hỏi lại 30 giây một lần khi mất kết nối. Đăng xuất thì thôi hỏi
 * (socket cũng tự đóng khi token bị xoá), để không gọi API rồi nhận 401.
 */
export function useUnreadCount() {
  const connected = useNotificationRealtime()
  const signedIn = useIsSignedIn()
  const query = useQuery({
    ...unreadCountQuery,
    enabled: signedIn,
    refetchInterval: connected || !signedIn ? false : UNREAD_POLL_MS,
  })
  return signedIn ? (query.data?.count ?? 0) : 0
}

const invalidate = [notificationKeys.lists(), notificationKeys.unreadCount()]

export const useMarkNotificationRead = () =>
  useApiMutation({ mutationFn: (id: string) => notificationsApi.markRead(id), invalidate })

export const useMarkAllNotificationsRead = () =>
  useApiMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    successMessage: 'Đã đánh dấu tất cả thông báo là đã đọc.',
    invalidate,
  })

export const useSaveNotificationPreferences = () => {
  const queryClient = useQueryClient()
  return useApiMutation({
    mutationFn: (mutedTypes: NotificationType[]) => notificationsApi.savePreferences(mutedTypes),
    successMessage: 'Đã lưu cài đặt thông báo.',
    onSuccess: (saved) => queryClient.setQueryData(notificationKeys.preferences(), saved),
  })
}
