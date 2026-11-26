import { ArrowLeft, ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'

import { QueryErrorAlert } from '../../../components/common'
import { myRentalPath, PATHS, toyDetailPath } from '../../../routes/paths'
import { counterpartName, type Conversation } from '../chat-api'
import { useChatRoom } from '../hooks/use-chat-room'
import { ChatAvatar } from './chat-avatar'
import { MessageComposer } from './message-composer'
import { MessageList } from './message-list'
import { ReadOnlyBanner } from './read-only-banner'

/** Đơn của phòng chat: mở trang chi tiết đơn (đơn mua chưa có trang thì chỉ hiện mã) */
function SubjectLink({ conversation }: { conversation: Conversation }) {
  const { subject, toy } = conversation
  if (subject.kind === 'RENTAL_ORDER' && subject.code) {
    return (
      <Link to={myRentalPath(subject.id)} className="chat-room__subject-link">
        Đơn thuê {subject.code} <ExternalLink aria-hidden />
      </Link>
    )
  }
  if (subject.code) return <span>Đơn mua {subject.code}</span>
  if (toy) {
    return (
      <Link to={toyDetailPath(toy.id)} className="chat-room__subject-link">
        {toy.title} <ExternalLink aria-hidden />
      </Link>
    )
  }
  return <span>Tin đồ chơi đã ẩn</span>
}

/** Một phòng chat: đầu phòng (người kia, món đồ, đơn), tin nhắn, ô soạn hoặc banner chỉ xem */
export function ChatRoom({ conversationId }: { conversationId: string }) {
  const room = useChatRoom(conversationId)
  const conversation = room.conversation.data

  if (room.conversation.isError) {
    return (
      <section className="chat-room chat-room--state">
        <QueryErrorAlert error={room.conversation.error} onRetry={() => void room.conversation.refetch()} />
        <Link to={PATHS.chat} className="chat-room__back-link">
          <ArrowLeft aria-hidden /> Về hộp thư
        </Link>
      </section>
    )
  }

  return (
    <section className="chat-room" aria-label={conversation ? `Trò chuyện với ${counterpartName(conversation.counterpart)}` : 'Phòng chat'}>
      <header className="chat-room__head">
        <Link to={PATHS.chat} className="chat-room__back" aria-label="Về hộp thư">
          <ArrowLeft aria-hidden />
        </Link>
        {conversation ? (
          <>
            <ChatAvatar person={conversation.counterpart} />
            <div className="chat-room__who">
              <h2 className="chat-room__name">{counterpartName(conversation.counterpart)}</h2>
              <p className="chat-room__subject">
                <SubjectLink conversation={conversation} />
              </p>
            </div>
            {conversation.toy?.imageUrl && <img src={conversation.toy.imageUrl} alt="" className="chat-room__toy" />}
          </>
        ) : (
          <span className="chat-room__head-skeleton" aria-hidden />
        )}
      </header>

      {room.messagesQuery.isError ? (
        <div className="chat-room__error">
          <QueryErrorAlert error={room.messagesQuery.error} onRetry={() => void room.messagesQuery.refetch()} />
        </div>
      ) : room.messagesQuery.isPending ? (
        <div className="chat-messages chat-messages--loading" aria-busy="true" aria-label="Đang tải tin nhắn">
          <span />
          <span />
          <span />
        </div>
      ) : (
        <MessageList
          me={room.me}
          messages={room.messages}
          pending={room.pending}
          hasOlder={room.hasOlder}
          loadingOlder={room.loadingOlder}
          loadOlder={room.loadOlder}
          canRetry={!room.readOnly}
          onRetry={room.retry}
          onDiscard={room.discard}
        />
      )}

      {conversation && <ReadOnlyBanner conversation={conversation} />}
      {conversation && !room.readOnly && <MessageComposer onSend={room.send} />}
    </section>
  )
}
