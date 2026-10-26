import { BadgeCheck, Boxes, EyeOff, Eye, Hourglass, type LucideIcon } from 'lucide-react'
import type { ListingCounts } from '../toy-listing-queries'

const STATS: { key: keyof ListingCounts; label: string; hint: string; icon: LucideIcon }[] = [
  { key: 'all', label: 'Tổng tin đăng', hint: 'Tất cả trạng thái', icon: Boxes },
  { key: 'active', label: 'Đang hiển thị', hint: 'Sẵn sàng nhận khách', icon: Eye },
  { key: 'pending', label: 'Chờ kiểm duyệt', hint: 'Đang chờ Quản trị viên', icon: Hourglass },
  { key: 'sold', label: 'Đã bán', hint: 'Giao dịch hoàn tất', icon: BadgeCheck },
  { key: 'hidden', label: 'Đã ẩn', hint: 'Không hiển thị trên sàn', icon: EyeOff },
]

/** Số có 1 chữ số hiển thị dạng 08 như thiết kế, giữ độ rộng cột số đồng đều */
const pad = (value: number) => String(value).padStart(2, '0')

export function ListingStats({ counts }: { counts?: ListingCounts }) {
  return (
    <dl className="listing-stats">
      {STATS.map(({ key, label, hint, icon: Icon }) => (
        <div key={key} className={`listing-stat listing-stat--${key}`}>
          <div className="listing-stat__head">
            <dt className="listing-stat__label">{label}</dt>
            <span className="listing-stat__icon">
              <Icon aria-hidden />
            </span>
          </div>
          <dd className="listing-stat__value-row">
            <span className="listing-stat__value">{counts ? pad(counts[key]) : '–'}</span>
            <span className="listing-stat__hint">{hint}</span>
          </dd>
        </div>
      ))}
    </dl>
  )
}
