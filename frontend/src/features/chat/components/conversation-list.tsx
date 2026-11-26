import { useInfiniteQuery } from '@tanstack/react-query'
import { MessageCircleOff, Search } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { NavLink } from 'react-router-dom'

import { QueryErrorAlert } from '../../../components/common'
import { chatRoomPath } from '../../../routes/paths'
import { dayjs, inVietnam } from '../../../utils/dayjs'
import { counterpartName, type Conversation } from '../chat-api'
import { conversationsQuery } from '../chat-queries'
import { CHAT_SEARCH_MAX } from '../chat-schema'
import { ChatAvatar } from './chat-avatar'

const SEARCH_DEBOUNCE_MS = 300

/** Hôm nay: giờ; trong tuần: thứ; xa hơn: ngày */
function sentAtLabel(iso: string): string {
  const sent = inVietnam(iso)
  const now = inVietnam(dayjs().toDate())
  if (sent.isSame(now, 'day')) return sent.format('HH:mm')
  if (now.diff(sent, 'day') < 7) return sent.format('ddd')
  return sent.format('DD/MM/YY')
}

function previewOf(conversation: Conversation, me: string | null): string {
  const last = conversation.lastMessage
  if (!last) return 'Chưa có tin nhắn'
  const content = last.preview || (last.imageCount > 0 ? `[${last.imageCount} ảnh]` : '')
  return last.senderId === me ? `Bạn: ${content}` : content
}

function ConversationItem({ conversation, me }: { conversation: Conversation; me: string | null }) {
  const name = counterpartName(conversation.counterpart)
  const unread = conversation.unreadCount
  return (
    <li>
      <NavLink
        to={chatRoomPath(conversation.id)}
        className={({ isActive }) => `chat-inbox__item ${isActive ? 'is-active' : ''} ${unread > 0 ? 'is-unread' : ''}`}
        aria-label={`${name}${unread > 0 ? `, ${unread} tin chưa đọc` : ''}`}
      >
        <ChatAvatar person={conversation.counterpart} size={44} />
        <span className="chat-inbox__text">
          <span className="chat-inbox__row">
            <strong className="chat-inbox__name">{name}</strong>
            {conversation.lastMessage && (
              <time className="chat-inbox__time" dateTime={conversation.lastMessage.sentAt}>
                {sentAtLabel(conversation.lastMessage.sentAt)}
              </time>
            )}
          </span>
          <span className="chat-inbox__subject">
            {conversation.subject.code && <span className="chat-inbox__code">{conversation.subject.code}</span>}
            {conversation.toy?.title ?? 'Tin đồ chơi đã ẩn'}
          </span>
          <span className="chat-inbox__row">
            <span className="chat-inbox__preview">{previewOf(conversation, me)}</span>
            {conversation.readOnly && <span className="chat-inbox__tag">Chỉ xem</span>}
            {unread > 0 && (
              <span className="chat-inbox__badge" aria-hidden>
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </span>
        </span>
        {conversation.toy?.imageUrl && <img src={conversation.toy.imageUrl} alt="" className="chat-inbox__toy" />}
      </NavLink>
    </li>
  )
}

/** Hộp thư: tìm theo tên người kia hoặc mã đơn (≤ 50 ký tự), tin mới nhất lên đầu */
export function ConversationList({ me }: { me: string | null }) {
  const searchId = useId()
  const [input, setInput] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [input])

  const list = useInfiniteQuery(conversationsQuery(search))
  const conversations = list.data?.pages.flatMap((page) => page.items) ?? []

  return (
    <section className="chat-inbox" aria-labelledby={`${searchId}-title`}>
      <header className="chat-inbox__head">
        <h1 id={`${searchId}-title`} className="chat-inbox__title">
          Tin nhắn
        </h1>
        <label htmlFor={searchId} className="chat-inbox__search">
          <Search aria-hidden />
          <span className="sr-only">Tìm cuộc trò chuyện</span>
          <input
            id={searchId}
            type="search"
            value={input}
            maxLength={CHAT_SEARCH_MAX}
            placeholder="Tìm theo tên hoặc mã đơn"
            onChange={(event) => setInput(event.target.value)}
            autoComplete="off"
          />
        </label>
      </header>

      {list.isPending && (
        <div className="chat-inbox__skeleton" aria-busy="true" aria-label="Đang tải cuộc trò chuyện">
          {[0, 1, 2, 3].map((index) => (
            <span key={index} />
          ))}
        </div>
      )}

      {list.isError && (
        <div className="chat-inbox__state">
          <QueryErrorAlert error={list.error} onRetry={() => void list.refetch()} />
        </div>
      )}

      {list.isSuccess && conversations.length === 0 && (
        <div className="chat-inbox__state chat-inbox__empty">
          <MessageCircleOff aria-hidden />
          <p>{search ? `Không tìm thấy cuộc trò chuyện nào khớp “${search}”.` : 'Bạn chưa có cuộc trò chuyện nào.'}</p>
          {!search && <p className="chat-inbox__hint">Bấm “Nhắn tin” ở trang đồ chơi hoặc đơn thuê để bắt đầu.</p>}
        </div>
      )}

      {conversations.length > 0 && (
        <ul className="chat-inbox__list">
          {conversations.map((conversation) => (
            <ConversationItem key={conversation.id} conversation={conversation} me={me} />
          ))}
        </ul>
      )}

      {list.hasNextPage && (
        <button
          type="button"
          className="chat-inbox__more"
          disabled={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          {list.isFetchingNextPage ? 'Đang tải…' : 'Xem thêm'}
        </button>
      )}
    </section>
  )
}
