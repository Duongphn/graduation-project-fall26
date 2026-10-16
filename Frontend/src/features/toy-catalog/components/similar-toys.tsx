import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { PATHS } from '../../../routes/paths'
import { toCatalogSearch } from '../catalog-search-params'
import type { ToyDetail } from '../toy-catalog-api'
import { toySearchQuery } from '../toy-catalog-queries'
import { ToyCard } from './toy-card'

const SHOWN = 4

/** Món cùng danh mục, mới đăng trước; lấy dư một món để bỏ chính món đang xem */
export function SimilarToys({ toy }: { toy: ToyDetail }) {
  const filters = { categoryId: toy.category.id, page: 1, limit: SHOWN + 1 }
  const similar = useQuery(toySearchQuery(filters))
  const items = (similar.data?.items ?? []).filter((item) => item.id !== toy.id).slice(0, SHOWN)

  // Không có món nào khác (hoặc lỗi tải) thì ẩn cả khối thay vì để một vùng trống
  if (items.length === 0) return null

  return (
    <section className="similar-toys" aria-labelledby="similar-title">
      <div className="similar-toys__head">
        <h2 id="similar-title" className="tf-section-title tf-section-title--md">
          Đồ chơi cùng danh mục
        </h2>
        <Link to={`${PATHS.toys}?${toCatalogSearch({ categoryId: toy.category.id, page: 1 })}`} className="tf-breadcrumb__link">
          Xem tất cả {toy.category.name}
        </Link>
      </div>
      <ul className="catalog-grid similar-toys__grid">
        {items.map((item, index) => (
          <li key={item.id}>
            <ToyCard toy={item} index={index} />
          </li>
        ))}
      </ul>
    </section>
  )
}
