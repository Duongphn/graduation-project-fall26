import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface ListingPaginationProps {
  page: number
  pageSize: number
  total: number
  /** Tạo query string cho trang đích, giữ nguyên bộ lọc hiện tại */
  hrefFor: (page: number) => string
}

export function ListingPagination({ page, pageSize, total, hrefFor }: ListingPaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return (
    <div className="listing-pagination">
      <p className="listing-pagination__summary">
        Hiển thị <strong>{from}–{to}</strong> trong tổng số <strong>{total}</strong> tin đăng
      </p>

      {pageCount > 1 && (
        <nav className="listing-pagination__pages" aria-label="Phân trang">
          <PageLink to={hrefFor(page - 1)} disabled={page <= 1} label="Trang trước">
            <ChevronLeft aria-hidden />
          </PageLink>
          {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => (
            <Link
              key={number}
              to={hrefFor(number)}
              className={`page-btn ${number === page ? 'is-active' : ''}`}
              aria-current={number === page ? 'page' : undefined}
            >
              {number}
            </Link>
          ))}
          <PageLink to={hrefFor(page + 1)} disabled={page >= pageCount} label="Trang sau">
            <ChevronRight aria-hidden />
          </PageLink>
        </nav>
      )}
    </div>
  )
}

function PageLink({ to, disabled, label, children }: { to: string; disabled: boolean; label: string; children: ReactNode }) {
  if (disabled) {
    return (
      <span className="page-btn is-disabled" aria-disabled="true" aria-label={label}>
        {children}
      </span>
    )
  }
  return (
    <Link to={to} className="page-btn" aria-label={label}>
      {children}
    </Link>
  )
}
