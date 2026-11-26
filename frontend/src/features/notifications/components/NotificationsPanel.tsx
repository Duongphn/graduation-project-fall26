import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Badge, Button, Card, Empty, List, Pagination, Segmented, Skeleton, Switch, Tag, Typography } from 'antd'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { QueryErrorAlert, RelativeTime } from '../../../components/common'
import { useIsSignedIn } from '../../../hooks/use-is-signed-in'
import { notificationTargetPath, notificationTypeLabels } from '../notification-target'
import type { AppNotification, NotificationType } from '../notifications-api'
import {
  NOTIFICATION_PAGE_SIZE,
  notificationPreferencesQuery,
  notificationsPageQuery,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useSaveNotificationPreferences,
  useUnreadCount,
} from '../notifications-queries'

type Filter = 'all' | 'unread'

function NotificationRow({ notification }: { notification: AppNotification }) {
  const navigate = useNavigate()
  const markRead = useMarkNotificationRead()
  const target = notificationTargetPath(notification)

  const open = () => {
    if (!notification.isRead) markRead.mutate(notification.id)
    if (target) navigate(target)
  }

  return (
    <List.Item
      actions={
        notification.isRead
          ? []
          : [
              <Button
                key="read"
                type="link"
                size="small"
                loading={markRead.isPending}
                onClick={() => markRead.mutate(notification.id)}
              >
                Đánh dấu đã đọc
              </Button>,
            ]
      }
    >
      <button
        type="button"
        onClick={open}
        className={`flex w-full flex-col gap-1 border-0 bg-transparent p-0 text-left ${target ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <span className="flex flex-wrap items-center gap-2">
          {!notification.isRead && <Badge status="processing" aria-label="Chưa đọc" />}
          <Typography.Text strong={!notification.isRead}>{notification.title}</Typography.Text>
          <Tag>{notificationTypeLabels[notification.type] ?? 'Hệ thống'}</Tag>
        </span>
        <Typography.Text type="secondary">{notification.body}</Typography.Text>
        <Typography.Text type="secondary" className="text-xs">
          <RelativeTime value={notification.createdAt} />
        </Typography.Text>
      </button>
    </List.Item>
  )
}

/** Tắt theo loại: chỉ các loại không quan trọng; loại quan trọng luôn được gửi */
function NotificationSettings() {
  // Signed out (logout clears the cache while the page is still shown): no request, no 401.
  const preferences = useQuery({ ...notificationPreferencesQuery, enabled: useIsSignedIn() })
  const save = useSaveNotificationPreferences()
  const types = preferences.data?.types ?? []
  const muted = types.filter((item) => item.muted).map((item) => item.type)

  const toggle = (type: NotificationType, on: boolean) =>
    save.mutate(on ? muted.filter((item) => item !== type) : [...muted, type])

  return (
    <Card title="Cài đặt thông báo" size="small">
      {preferences.isPending && <Skeleton active paragraph={{ rows: 3 }} />}
      {preferences.isError && (
        <QueryErrorAlert error={preferences.error} onRetry={() => void preferences.refetch()} />
      )}
      {preferences.isSuccess && (
        <>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {types
              .filter((item) => item.canMute)
              .map((item) => (
                <li key={item.type} className="flex items-center justify-between gap-3">
                  <label htmlFor={`notification-type-${item.type}`}>{notificationTypeLabels[item.type]}</label>
                  <Switch
                    id={`notification-type-${item.type}`}
                    size="small"
                    checked={!item.muted}
                    loading={save.isPending}
                    onChange={(on) => toggle(item.type, on)}
                  />
                </li>
              ))}
          </ul>
          <Typography.Paragraph type="secondary" className="!mt-4 !mb-0 text-xs">
            Thông báo về đơn hàng, thanh toán, ví, khiếu nại, tài khoản và kết quả duyệt luôn được gửi. Thông báo quan
            trọng được gửi kèm email.
          </Typography.Paragraph>
        </>
      )}
    </Card>
  )
}

interface NotificationsPanelProps {
  /** Cài đặt tắt theo loại (tin nhắn, mã giảm giá…) chỉ dành cho người dùng; trang Admin tắt đi */
  showSettings?: boolean
}

/** Danh sách thông báo đầy đủ (người dùng và Admin): lọc chưa đọc, phân trang, đọc tất cả, cài đặt */
export function NotificationsPanel({ showSettings = true }: NotificationsPanelProps) {
  const [filter, setFilter] = useState<Filter>('all')
  const [page, setPage] = useState(1)
  const unread = useUnreadCount()
  const list = useQuery({
    ...notificationsPageQuery(page, filter === 'unread'),
    placeholderData: keepPreviousData,
    // Signed out (logout clears the cache while the page is still shown): no request, no 401.
    enabled: useIsSignedIn(),
  })
  const markAll = useMarkAllNotificationsRead()
  const items = list.data?.items ?? []
  const total = list.data?.pagination.totalItems ?? 0

  return (
    // minmax(0, 1fr) and a wrapping card header: on a phone the filter and "mark all read" go on
    // two lines instead of widening the page.
    <div
      className={`grid grid-cols-[minmax(0,1fr)] gap-6 ${showSettings ? 'lg:grid-cols-[minmax(0,1fr)_18rem]' : ''}`}
    >
      <Card
        className="[&_.ant-card-head-title]:flex-[1_0_auto] [&_.ant-card-head-wrapper]:flex-wrap [&_.ant-card-head-wrapper]:gap-2 [&_.ant-card-head-wrapper]:py-2"
        title={
          <Segmented<Filter>
            value={filter}
            onChange={(value) => {
              setFilter(value)
              setPage(1)
            }}
            options={[
              { label: 'Tất cả', value: 'all' },
              { label: `Chưa đọc (${unread})`, value: 'unread' },
            ]}
          />
        }
        extra={
          <Button disabled={unread === 0} loading={markAll.isPending} onClick={() => markAll.mutate()}>
            Đánh dấu đã đọc tất cả
          </Button>
        }
      >
        {list.isError && <QueryErrorAlert error={list.error} onRetry={() => void list.refetch()} />}
        {list.isPending && <Skeleton active paragraph={{ rows: 6 }} />}
        {list.isSuccess && items.length === 0 && (
          <Empty description={filter === 'unread' ? 'Bạn đã đọc hết thông báo.' : 'Bạn chưa có thông báo nào.'} />
        )}
        {items.length > 0 && (
          <List
            dataSource={items}
            rowKey="id"
            renderItem={(notification) => <NotificationRow notification={notification} />}
          />
        )}
        {total > NOTIFICATION_PAGE_SIZE && (
          <Pagination
            className="!mt-4 flex justify-end"
            current={page}
            pageSize={NOTIFICATION_PAGE_SIZE}
            total={total}
            showSizeChanger={false}
            onChange={setPage}
          />
        )}
      </Card>
      {showSettings && <NotificationSettings />}
    </div>
  )
}
