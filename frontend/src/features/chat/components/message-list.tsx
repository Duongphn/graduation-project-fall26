import { LoaderCircle, MessagesSquare } from 'lucide-react'
import { Fragment, useLayoutEffect, useRef } from 'react'

import { dayjs, inVietnam } from '../../../utils/dayjs'
import type { ChatMessage } from '../chat-api'
import type { PendingMessage } from '../hooks/use-chat-room'
import { MessageBubble, PendingBubble } from './message-bubble'

/** Cách mép trên bao nhiêu px thì tải trang cũ hơn; cách đáy bao nhiêu px vẫn coi là "đang ở cuối" */
const LOAD_OLDER_PX = 80
const STICK_BOTTOM_PX = 120

const dayKey = (iso: string) => inVietnam(iso).format('YYYY-MM-DD')

/** "Hôm nay", "Hôm qua" hoặc ngày đầy đủ, theo giờ Việt Nam */
function dayLabel(iso: string): string {
  const day = inVietnam(iso).startOf('day')
  const today = inVietnam(dayjs().toDate()).startOf('day')
  const diff = today.diff(day, 'day')
  if (diff === 0) return 'Hôm nay'
  if (diff === 1) return 'Hôm qua'
  return day.format('DD/MM/YYYY')
}

interface MessageListProps {
  me: string | null
  messages: ChatMessage[]
  pending: PendingMessage[]
  hasOlder: boolean
  loadingOlder: boolean
  loadOlder: () => void
  canRetry: boolean
  onRetry: (clientId: string) => void
  onDiscard: (clientId: string) => void
}

/**
 * Tin nhắn cũ → mới. Mở phòng thì cuộn xuống tin mới nhất; cuộn lên đầu thì tải trang cũ hơn và
 * giữ nguyên chỗ đang đọc; tin mới chỉ kéo xuống đáy khi đang ở cuối (hoặc là tin mình gửi).
 */
export function MessageList({
  me,
  messages,
  pending,
  hasOlder,
  loadingOlder,
  loadOlder,
  canRetry,
  onRetry,
  onDiscard,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const olderAnchor = useRef<{ height: number; top: number } | null>(null)
  const atBottom = useRef(true)

  const firstId = messages[0]?.id
  const lastPending = pending.at(-1)
  const lastMessage = messages.at(-1)
  const lastKey = lastPending?.clientId ?? lastMessage?.id
  const lastIsMine = Boolean(lastPending) || (lastMessage !== undefined && lastMessage.senderId === me)

  const requestOlder = () => {
    const element = scrollRef.current
    if (!hasOlder || loadingOlder) return
    if (element) olderAnchor.current = { height: element.scrollHeight, top: element.scrollTop }
    loadOlder()
  }

  // Trang cũ hơn vừa chèn lên đầu: bù đúng phần chiều cao mới để màn hình không nhảy
  useLayoutEffect(() => {
    const element = scrollRef.current
    const anchor = olderAnchor.current
    if (!element || !anchor) return
    element.scrollTop = element.scrollHeight - anchor.height + anchor.top
    olderAnchor.current = null
  }, [firstId])

  // Tin mới ở cuối (cả lần tải đầu)
  useLayoutEffect(() => {
    const element = scrollRef.current
    if (!element || !lastKey) return
    if (atBottom.current || lastIsMine) element.scrollTop = element.scrollHeight
  }, [lastKey, lastIsMine])

  const handleScroll = () => {
    const element = scrollRef.current
    if (!element) return
    atBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < STICK_BOTTOM_PX
    if (element.scrollTop < LOAD_OLDER_PX) requestOlder()
  }

  // "Đã xem" chỉ dưới tin cuối cùng của mình mà người kia đã đọc
  const lastSeenId = [...messages].reverse().find((message) => message.senderId === me && message.isRead)?.id

  return (
    <div ref={scrollRef} className="chat-messages" onScroll={handleScroll}>
      {hasOlder && (
        <div className="chat-messages__older">
          <button type="button" onClick={requestOlder} disabled={loadingOlder}>
            {loadingOlder ? (
              <>
                <LoaderCircle aria-hidden className="animate-spin" /> Đang tải tin cũ…
              </>
            ) : (
              'Xem tin nhắn cũ hơn'
            )}
          </button>
        </div>
      )}

      {messages.length === 0 && pending.length === 0 ? (
        <div className="chat-messages__empty">
          <MessagesSquare aria-hidden />
          <p>Chưa có tin nhắn nào. Hãy gửi lời chào để bắt đầu trao đổi.</p>
        </div>
      ) : (
        <ol className="chat-messages__list" aria-label="Tin nhắn" aria-live="polite">
          {messages.map((message, index) => {
            const newDay = index === 0 || dayKey(messages[index - 1].createdAt) !== dayKey(message.createdAt)
            return (
              <Fragment key={message.id}>
                {newDay && (
                  <li className="chat-messages__day" aria-hidden>
                    <span>{dayLabel(message.createdAt)}</span>
                  </li>
                )}
                <MessageBubble message={message} mine={message.senderId === me} showSeen={message.id === lastSeenId} />
              </Fragment>
            )
          })}
          {pending.map((message) => (
            <PendingBubble
              key={message.clientId}
              message={message}
              canRetry={canRetry}
              onRetry={() => onRetry(message.clientId)}
              onDiscard={() => onDiscard(message.clientId)}
            />
          ))}
        </ol>
      )}
    </div>
  )
}
