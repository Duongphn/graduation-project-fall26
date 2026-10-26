import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, WifiOff } from 'lucide-react'
import { Link } from 'react-router-dom'
import { browseToysPath } from '../../../routes/paths'
import { getApiErrorMessage } from '../../../services/http-client'
import { EmptyState } from '../components/empty-state'
import { getCategoryVisual } from '../home-content'
import { homeCategoriesQuery, selectRootCategories } from '../home-queries'
import { useScrollArrows } from '../hooks/use-scroll-arrows'

const SKELETON_COUNT = 10

/** Danh mục: một hàng ngang gọn (icon + tên); dài hơn màn hình thì cuộn ngang, có mũi tên ‹ › */
export function CategoriesSection() {
  const result = useQuery({ ...homeCategoriesQuery, select: selectRootCategories })
  const { scrollerRef, canScrollPrev, canScrollNext, scrollByPage } = useScrollArrows<HTMLUListElement>()

  // Chưa có danh mục nào: ẩn cả section thay vì hiện ô trống
  if (result.isSuccess && result.data.length === 0) return null

  if (result.isError) {
    return (
      <section className="home-container home-section" aria-label="Danh mục đồ chơi">
        <EmptyState
          variant="error"
          icon={WifiOff}
          title="Chưa tải được danh mục"
          description={getApiErrorMessage(result.error)}
          action={
            <button type="button" className="home-button home-button--outline" onClick={() => void result.refetch()}>
              Thử lại
            </button>
          }
        />
      </section>
    )
  }

  return (
    <nav className="home-container home-section" aria-label="Danh mục đồ chơi">
      <div className="category-strip">
        <ul ref={scrollerRef} className="category-strip__list" aria-busy={result.isPending}>
          {result.isPending
            ? Array.from({ length: SKELETON_COUNT }, (_, index) => (
                <li key={index} className="category-strip__item" aria-hidden>
                  <span className="category-strip__icon home-skeleton" />
                  <span className="category-strip__skeleton-label home-skeleton" />
                </li>
              ))
            : result.data.map((category) => {
                const { icon: Icon, tone, image } = getCategoryVisual(category.slug)
                return (
                  <li key={category.id} className="category-strip__item">
                    <Link to={browseToysPath({ category: category.slug })} className="category-strip__link">
                      <span className={`category-strip__icon tone--${tone}`} aria-hidden>
                        {image ? (
                          <img src={image} alt="" className="category-strip__image" loading="lazy" decoding="async" />
                        ) : (
                          <Icon />
                        )}
                      </span>
                      <span className="category-strip__name">{category.name}</span>
                      {category.toyCount !== undefined && (
                        <span className="category-strip__count">{category.toyCount} món</span>
                      )}
                    </Link>
                  </li>
                )
              })}
        </ul>

        {/* Mũi tên chỉ hiện ở phía còn nội dung; trên cảm ứng vẫn vuốt được */}
        {canScrollPrev && (
          <button
            type="button"
            className="category-strip__arrow category-strip__arrow--prev"
            aria-label="Xem danh mục trước"
            onClick={() => scrollByPage(-1)}
          >
            <ChevronLeft aria-hidden />
          </button>
        )}
        {canScrollNext && (
          <button
            type="button"
            className="category-strip__arrow category-strip__arrow--next"
            aria-label="Xem thêm danh mục"
            onClick={() => scrollByPage(1)}
          >
            <ChevronRight aria-hidden />
          </button>
        )}
      </div>
    </nav>
  )
}
