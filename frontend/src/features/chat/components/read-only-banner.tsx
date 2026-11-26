import { Clock, Lock } from 'lucide-react'

import { dayjs } from '../../../utils/dayjs'
import { formatDateTime } from '../../../utils/format'
import type { Conversation } from '../chat-api'

/**
 * Trạng thái đóng của chat theo đơn: đã chỉ xem (đơn kết thúc quá 7 ngày) thì thay cho ô soạn tin;
 * đơn đã kết thúc nhưng chưa tới hạn thì báo trước thời điểm đóng.
 */
export function ReadOnlyBanner({ conversation }: { conversation: Pick<Conversation, 'readOnly' | 'closesAt'> }) {
  if (conversation.readOnly) {
    return (
      <div className="chat-banner chat-banner--closed" role="status">
        <Lock aria-hidden />
        <p>Đơn đã kết thúc, cuộc trò chuyện chỉ còn xem được.</p>
      </div>
    )
  }
  if (conversation.closesAt && dayjs(conversation.closesAt).isAfter(dayjs())) {
    return (
      <div className="chat-banner chat-banner--closing" role="status">
        <Clock aria-hidden />
        <p>Đơn đã kết thúc. Cuộc trò chuyện sẽ đóng vào {formatDateTime(conversation.closesAt)}.</p>
      </div>
    )
  }
  return null
}
