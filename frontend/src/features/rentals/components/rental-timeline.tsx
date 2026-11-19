import { Cpu } from 'lucide-react'
import type { RentalTimelineEntry } from '../rental-orders-api'
import { formatDateTime, RENTAL_STATUS_META } from '../rental-display'

const ACTOR_ROLE_LABEL: Record<string, string> = {
  renter: 'Người thuê',
  owner: 'Chủ đồ',
  admin: 'Quản trị viên',
}

/**
 * Lịch sử đơn theo thứ tự thời gian: mỗi mốc là trạng thái mới, ai chuyển (người hay hệ thống),
 * lúc nào và ghi chú. Mốc cuối là trạng thái hiện tại nên được tô nổi.
 */
export function RentalTimeline({ entries }: { entries: RentalTimelineEntry[] }) {
  if (entries.length === 0) {
    return <p className="rental-block__note">Đơn chưa có thay đổi trạng thái nào.</p>
  }
  const lastIndex = entries.length - 1

  return (
    <ol className="rental-timeline">
      {entries.map((entry, index) => {
        const meta = RENTAL_STATUS_META[entry.newStatus]
        const current = index === lastIndex
        const { changedBy } = entry
        const roleLabel = ACTOR_ROLE_LABEL[changedBy.role]
        return (
          <li
            key={`${entry.occurredAt}-${index}`}
            className={`rental-timeline__item rental-timeline__item--${meta.tone} ${current ? 'is-current' : ''}`}
            aria-current={current ? 'step' : undefined}
          >
            <span className="rental-timeline__dot" aria-hidden="true" />
            <div className="rental-timeline__body">
              <p className="rental-timeline__head">
                <strong>{meta.label}</strong>
                <time dateTime={entry.occurredAt}>{formatDateTime(entry.occurredAt)}</time>
              </p>
              <p className="rental-timeline__actor">
                {changedBy.isSystem ? (
                  <>
                    <Cpu aria-hidden /> Hệ thống tự động
                  </>
                ) : (
                  <>
                    {changedBy.name}
                    {roleLabel && <span className="rental-timeline__role"> · {roleLabel}</span>}
                  </>
                )}
              </p>
              {entry.notes && <p className="rental-timeline__note">{entry.notes}</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
