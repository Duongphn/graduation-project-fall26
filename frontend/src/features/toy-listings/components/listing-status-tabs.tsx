import { Link } from 'react-router-dom'
import { LISTING_STATUSES, STATUS_LABELS } from '../listing-display'
import type { ListingStatus } from '../toy-listing-api'
import type { ListingCounts } from '../toy-listing-queries'

const TABS: { status?: ListingStatus; label: string }[] = [
  { label: 'Tất cả' },
  ...LISTING_STATUSES.map((status) => ({ status, label: STATUS_LABELS[status] })),
]

interface ListingStatusTabsProps {
  current?: ListingStatus
  counts?: ListingCounts
}

/** Bộ lọc nằm trên URL (?status=) để tải lại trang hay chia sẻ link vẫn giữ đúng tab */
export function ListingStatusTabs({ current, counts }: ListingStatusTabsProps) {
  return (
    <nav className="status-tabs" aria-label="Lọc theo trạng thái">
      {TABS.map(({ status, label }) => {
        const isActive = status === current
        return (
          <Link
            key={label}
            to={status ? `?status=${status}` : '?'}
            className={`status-tab ${isActive ? 'is-active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
          >
            {label}
            {counts && <span className="status-tab__count">{counts[status ?? 'all']}</span>}
          </Link>
        )
      })}
    </nav>
  )
}
