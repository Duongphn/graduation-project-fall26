import { useQuery } from '@tanstack/react-query'
import { Bell, BellOff, CheckCheck, RotateCw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { RelativeTime } from '../../components/common'
import { notificationTargetPath } from '../../features/notifications/notification-target'
import type { AppNotification } from '../../features/notifications/notifications-api'
import {
  latestNotificationsQuery,
  unreadCountQuery,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
} from '../../features/notifications/notifications-queries'
import { HeaderPopover } from './header-popover'

/** Số trên chuông: quá 99 hiện "99+" */
const badgeText = (count: number) => (count > 99 ? '99+' : String(count))

function NotificationList({ unread, close }: { unread: number; close: () => void }) {
  const navigate = useNavigate()
  const list = useQuery(latestNotificationsQuery)
  const markRead = useMarkNotificationRead()
  const markAll = useMarkAllNotificationsRead()
  const items = list.data?.items ?? []

  const open = (notification: AppNotification) => {
    if (!notification.isRead) markRead.mutate(notification.id)
    const target = notificationTargetPath(notification)
    if (target) {
      close()
      navigate(target)
    }
  }

  return (
    <>
      <div className="notification-menu__header">
        <p className="notification-menu__heading">Thông báo</p>
        {unread > 0 && (
          <button
            type="button"
            className="notification-menu__read-all"
            disabled={markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            <CheckCheck aria-hidden /> Đánh dấu đã đọc tất cả
          </button>
        )}
      </div>

      {list.isPending && (
        <div className="notification-menu__list" aria-busy="true" aria-label="Đang tải thông báo">
          {[0, 1, 2].map((index) => (
            <span key={index} className="notification-menu__skeleton" />
          ))}
        </div>
      )}

      {list.isError && (
        <div className="notification-menu__empty" role="alert">
          <BellOff aria-hidden />
          <p>Chưa tải được thông báo.</p>
          <button type="button" className="notification-menu__retry" onClick={() => void list.refetch()}>
            <RotateCw aria-hidden /> Thử lại
          </button>
        </div>
      )}

      {list.isSuccess && items.length === 0 && (
        <div className="notification-menu__empty">
          <BellOff aria-hidden />
          <p>Bạn chưa có thông báo nào.</p>
        </div>
      )}

      {items.length > 0 && (
        <ul className="notification-menu__list">
          {items.map((notification) => (
            <li key={notification.id}>
              <button
                type="button"
                className={`notification-menu__item ${notification.isRead ? '' : 'is-unread'}`}
                onClick={() => open(notification)}
              >
                <span className="notification-menu__title">
                  {!notification.isRead && <span className="notification-menu__dot" aria-label="Chưa đọc" />}
                  {notification.title}
                </span>
                <span className="notification-menu__body">{notification.body}</span>
                <span className="notification-menu__time">
                  <RelativeTime value={notification.createdAt} showAbsolute={false} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/** Chuông thông báo (chỉ hiện khi đã đăng nhập): số chưa đọc, 10 thông báo mới nhất, đánh dấu đã đọc */
export function NotificationMenu() {
  const unread = useQuery(unreadCountQuery)
  const count = unread.data?.count ?? 0

  return (
    <HeaderPopover
      triggerLabel={count > 0 ? `Thông báo, ${count} chưa đọc` : 'Thông báo'}
      triggerClassName="site-icon-button"
      trigger={
        <>
          <Bell aria-hidden />
          {count > 0 && (
            <span className="site-icon-button__badge" aria-hidden>
              {badgeText(count)}
            </span>
          )}
        </>
      }
      panelClassName="notification-menu"
    >
      {(close) => <NotificationList unread={count} close={close} />}
    </HeaderPopover>
  )
}
