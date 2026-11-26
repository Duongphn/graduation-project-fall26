import { MessageCircle } from 'lucide-react'
import { Link } from 'react-router-dom'

import { useChatUnreadCount } from '../../features/chat/chat-queries'
import { PATHS } from '../../routes/paths'

/** Icon Tin nhắn trên header (chỉ khi đã đăng nhập): số tin chưa đọc cập nhật realtime */
export function ChatMenu() {
  const count = useChatUnreadCount()
  return (
    <Link to={PATHS.chat} className="site-icon-button" aria-label={count > 0 ? `Tin nhắn, ${count} chưa đọc` : 'Tin nhắn'}>
      <MessageCircle aria-hidden />
      {count > 0 && (
        <span className="site-icon-button__badge" aria-hidden>
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )
}
