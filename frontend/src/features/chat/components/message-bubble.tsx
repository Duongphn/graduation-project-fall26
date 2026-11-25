import { Image } from 'antd'
import { AlertCircle, ImageOff, ShieldAlert } from 'lucide-react'

import { inVietnam } from '../../../utils/dayjs'
import type { ChatMessage } from '../chat-api'
import type { PendingMessage } from '../hooks/use-chat-room'

/** MSG41 (GB-11): thông tin liên hệ trong tin đã bị máy chủ ẩn thành "***" */
export const MASKED_NOTICE =
  'Một số thông tin liên hệ đã được ẩn (***) để bảo vệ bạn. Hãy trao đổi và giao dịch ngay trên ToyFlow.'

const timeOf = (iso: string) => inVietnam(iso).format('HH:mm')

function BubbleImages({ urls, alt }: { urls: (string | null)[]; alt: string }) {
  if (urls.length === 0) return null
  return (
    <Image.PreviewGroup>
      <div className={`chat-bubble__images chat-bubble__images--${Math.min(urls.length, 3)}`}>
        {urls.map((url, index) =>
          url ? (
            <Image
              key={`${url}-${index}`}
              src={url}
              alt={`${alt} ${index + 1}`}
              className="chat-bubble__image"
              rootClassName="chat-bubble__image-root"
            />
          ) : (
            // Link ảnh chưa có (máy chủ không cấu hình Cloudinary): giữ chỗ thay vì ảnh vỡ
            <span key={`missing-${index}`} className="chat-bubble__image-missing" role="img" aria-label={`${alt} ${index + 1} không hiển thị được`}>
              <ImageOff aria-hidden />
            </span>
          ),
        )}
      </div>
    </Image.PreviewGroup>
  )
}

interface MessageBubbleProps {
  message: ChatMessage
  mine: boolean
  /** Hiện "Đã xem" dưới tin cuối cùng của mình mà người kia đã đọc */
  showSeen?: boolean
}

export function MessageBubble({ message, mine, showSeen }: MessageBubbleProps) {
  return (
    <li className={`chat-bubble ${mine ? 'is-mine' : 'is-theirs'}`}>
      <div className="chat-bubble__body">
        <BubbleImages urls={message.images.map((image) => image.url)} alt="Ảnh trong tin nhắn" />
        {message.text && <p className="chat-bubble__text">{message.text}</p>}
      </div>
      {message.masked && (
        <p className="chat-bubble__masked">
          <ShieldAlert aria-hidden />
          {MASKED_NOTICE}
        </p>
      )}
      <p className="chat-bubble__meta">
        <time dateTime={message.createdAt}>{timeOf(message.createdAt)}</time>
        {showSeen && <span className="chat-bubble__seen"> · Đã xem</span>}
      </p>
    </li>
  )
}

interface PendingBubbleProps {
  message: PendingMessage
  onRetry: () => void
  onDiscard: () => void
  /** Phòng đã đóng: không cho thử lại */
  canRetry: boolean
}

/** Tin mình vừa gửi, chưa được máy chủ xác nhận */
export function PendingBubble({ message, onRetry, onDiscard, canRetry }: PendingBubbleProps) {
  const failed = message.status === 'failed'
  return (
    <li className={`chat-bubble is-mine is-pending ${failed ? 'is-failed' : ''}`} aria-busy={!failed}>
      <div className="chat-bubble__body">
        <BubbleImages urls={message.previews} alt="Ảnh đang gửi" />
        {message.text && <p className="chat-bubble__text">{message.text}</p>}
      </div>
      {failed ? (
        <p className="chat-bubble__failed" role="alert">
          <AlertCircle aria-hidden />
          <span>Gửi lỗi{message.error ? `: ${message.error}` : ''}</span>
          {canRetry && (
            <button type="button" onClick={onRetry}>
              Thử lại
            </button>
          )}
          <button type="button" onClick={onDiscard}>
            Bỏ
          </button>
        </p>
      ) : (
        <p className="chat-bubble__meta">Đang gửi…</p>
      )}
    </li>
  )
}
