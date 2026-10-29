import { Link } from 'react-router-dom'
import { toCatalogSearch } from '../catalog-search-params'
import type { CatalogFilters } from '../toy-catalog-api'

interface TypeTab {
  label: string
  type?: CatalogFilters['type']
  /** Chưa có backend (tin quyên góp chưa phải một loại tin): hiện nhưng không bấm được */
  upcoming?: boolean
}

const TABS: TypeTab[] = [
  { label: 'Tất cả' },
  { label: 'Cho thuê', type: 'rent' },
  { label: 'Bán lại', type: 'sell' },
  // Chờ API quyên góp (server/src/features/donation_requests)
  { label: 'Quyên góp', upcoming: true },
]

/**
 * Tab loại tin, cùng kiểu với tab trạng thái ở "Tin đăng của tôi".
 * Đổi loại tin thì bỏ khoảng giá: giá thuê theo ngày và giá bán không cùng thang.
 */
export function ListingTypeTabs({ filters }: { filters: CatalogFilters }) {
  return (
    <nav className="status-tabs" aria-label="Lọc theo loại tin">
      {TABS.map(({ label, type, upcoming }) => {
        if (upcoming) {
          return (
            <span key={label} className="status-tab is-unavailable" aria-disabled="true" title="Sắp ra mắt">
              {label}
              <span className="status-tab__count">Sắp có</span>
            </span>
          )
        }

        const isActive = type === filters.type
        const search = toCatalogSearch({ ...filters, type, minPrice: undefined, maxPrice: undefined, page: 1 })
        return (
          <Link
            key={label}
            to={`?${search}`}
            className={`status-tab ${isActive ? 'is-active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
