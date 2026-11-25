import { MessagesSquare } from 'lucide-react'
import { useEffect } from 'react'
import { useParams } from 'react-router-dom'

import { ChatRoom } from '../features/chat/components/chat-room'
import { ConversationList } from '../features/chat/components/conversation-list'
import { useCurrentUserId } from '../features/chat/chat-queries'
import { SiteLayout } from '../layouts/site/site-layout'

/**
 * Chat (UC25): /chat là hộp thư, /chat/:conversationId mở thêm phòng chat.
 * Desktop: hai cột (hộp thư | phòng). Mobile: một cột — hộp thư, hoặc phòng khi đã chọn.
 */
export function ChatPage() {
  const { conversationId } = useParams()
  const me = useCurrentUserId()

  useEffect(() => {
    document.title = 'Tin nhắn | ToyFlow'
  }, [])

  return (
    <SiteLayout>
      <div className={`home-container chat-page ${conversationId ? 'has-room' : ''}`}>
        <div className="chat-shell">
          <ConversationList me={me} />
          {conversationId ? (
            // key: đổi phòng thì dựng lại (tin đang gửi, ô soạn tin, vị trí cuộn của phòng cũ không mang sang)
            <ChatRoom key={conversationId} conversationId={conversationId} />
          ) : (
            <section className="chat-room chat-room--placeholder">
              <MessagesSquare aria-hidden />
              <p>Chọn một cuộc trò chuyện để xem tin nhắn.</p>
            </section>
          )}
        </div>
      </div>
    </SiteLayout>
  )
}
