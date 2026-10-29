import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toCatalogSearch } from '../catalog-search-params'
import type { CatalogFilters } from '../toy-catalog-api'
import { CATALOG_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '../toy-catalog-queries'

/** Trang đầu, trang cuối và hai trang kề trang hiện tại; khoảng trống thay bằng dấu … */
function pageItems(current: number, totalPages: number): Array<number | 'gap'> {
  const pages = [...new Set([1, current - 1, current, current + 1, totalPages])]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b)

  return pages.flatMap((page, index) => {
    const previous = pages[index - 1]
    return previous !== undefined && page - previous > 1 ? ['gap' as const, page] : [page]
  })
}

const countFormatter = new Intl.NumberFormat('vi-VN')

interface CatalogPaginationProps {
  filters: CatalogFilters
  total: number
  onPageSizeChange: (limit: number) => void
}

export function CatalogPagination({ filters, total, onPageSizeChange }: CatalogPaginationProps) {
  const pageSize = filters.limit ?? CATALOG_PAGE_SIZE
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(filters.page, totalPages)
  const hrefFor = (page: number) => `?${toCatalogSearch({ ...filters, page })}`
  const first = (current - 1) * pageSize + 1
  const last = Math.min(current * pageSize, total)

  return (
    <div className="catalog-pagination">
      <div className="catalog-pagination__row">
        {totalPages > 1 && (
          <nav aria-label="Phân trang kết quả">
            <ol className="catalog-pagination__pages">
              <li>
                {current > 1 ? (
                  <Link to={hrefFor(current - 1)} className="catalog-pagination__page" aria-label="Trang trước">
                    <ChevronLeft aria-hidden="true" />
                  </Link>
                ) : (
                  <span className="catalog-pagination__page is-disabled" aria-hidden="true">
                    <ChevronLeft />
                  </span>
                )}
              </li>
              {pageItems(current, totalPages).map((item, index) =>
                item === 'gap' ? (
                  <li key={`gap-${index}`} className="catalog-pagination__page is-gap" aria-hidden="true">
                    …
                  </li>
                ) : (
                  <li key={item}>
                    <Link
                      to={hrefFor(item)}
                      className="catalog-pagination__page"
                      aria-current={item === current ? 'page' : undefined}
                      aria-label={`Trang ${item}`}
                    >
                      {item}
                    </Link>
                  </li>
                ),
              )}
              <li>
                {current < totalPages ? (
                  <Link to={hrefFor(current + 1)} className="catalog-pagination__page" aria-label="Trang sau">
                    <ChevronRight aria-hidden="true" />
                  </Link>
                ) : (
                  <span className="catalog-pagination__page is-disabled" aria-hidden="true">
                    <ChevronRight />
                  </span>
                )}
              </li>
            </ol>
          </nav>
        )}

        <div className="catalog-pagination__size">
          <label className="sr-only" htmlFor="catalog-page-size">
            Số món mỗi trang
          </label>
          <select id="catalog-page-size" value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size} / trang
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden="true" />
        </div>
      </div>

      <p className="catalog-pagination__summary">
        Hiển thị {countFormatter.format(first)}–{countFormatter.format(last)} trên {countFormatter.format(total)} kết quả
      </p>
    </div>
  )
}
