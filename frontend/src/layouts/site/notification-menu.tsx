import { Bell, BellOff } from 'lucide-react'
import { HeaderPopover } from './header-popover'

/**
 * Chuông thông báo (chỉ hiện khi đã đăng nhập). Backend chưa có API thông báo nên chưa có
 * danh sách / số đếm — hiện trạng thái trống, không dùng dữ liệu giả.
 */
export function NotificationMenu() {
  return (
    <HeaderPopover
      triggerLabel="Thông báo"
      triggerClassName="site-icon-button"
      trigger={<Bell aria-hidden />}
      panelClassName="notification-menu"
    >
      {() => (
        <>
          <p className="notification-menu__heading">Thông báo</p>
          <div className="notification-menu__empty">
            <BellOff aria-hidden />
            <p>Bạn chưa có thông báo mới.</p>
          </div>
        </>
      )}
    </HeaderPopover>
  )
}
