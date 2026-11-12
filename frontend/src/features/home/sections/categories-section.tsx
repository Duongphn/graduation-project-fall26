import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, WifiOff } from 'lucide-react'
import { Link } from 'react-router-dom'
import { browseToysPath } from '../../../routes/paths'
import { getApiErrorMessage } from '../../../services/http-client'
import { EmptyState } from '../components/empty-state'
import { getCategoryVisual } from '../home-content'
import { homeCategoriesQuery, selectRootCategories } from '../home-queries'
import { homeButton, SKELETON, TONE_CLASSES } from '../home-styles'
import { useScrollArrows } from '../hooks/use-scroll-arrows'

const SKELETON_COUNT = 10

/** Đủ chỗ thì các mục dàn đều hết chiều ngang; thiếu chỗ thì giữ tối thiểu 96px và cuộn */
const ITEM = 'min-w-24 flex-1 shrink-0 snap-start'
const ICON_BOX = 'grid size-16 place-items-center rounded-2xl'

/** Mũi tên tròn nổi ở mép, che phần mục bị cắt; ẩn trên màn cảm ứng nhỏ (vuốt là đủ) */
const ARROW =
  'absolute top-1/2 hidden size-9 -translate-y-1/2 cursor-pointer place-items-center rounded-full border border-site-line bg-white text-site-ink shadow-[0_4px_14px_-4px_rgb(18_23_31/0.3)] transition-[background-color,transform] duration-200 hover:scale-105 hover:bg-tf-surface-low focus-ring sm:grid dark:border-night-700 dark:bg-night-800 dark:text-white [&_svg]:size-5'

/** Danh mục: một hàng ngang gọn (icon + tên); dài hơn màn hình thì cuộn ngang, có mũi tên ‹ › */
export function CategoriesSection() {
  const result = useQuery({ ...homeCategoriesQuery, select: selectRootCategories })
  const { scrollerRef, canScrollPrev, canScrollNext, scrollByPage } = useScrollArrows<HTMLUListElement>()

  // Chưa có danh mục nào: ẩn cả section thay vì hiện ô trống
  if (result.isSuccess && result.data.length === 0) return null

  if (result.isError) {
    return (
      <section className="home-container mt-6 sm:mt-8" aria-label="Danh mục đồ chơi">
        <EmptyState
          variant="error"
          icon={WifiOff}
          title="Chưa tải được danh mục"
          description={getApiErrorMessage(result.error)}
          action={
            <button type="button" className={homeButton('outline')} onClick={() => void result.refetch()}>
              Thử lại
            </button>
          }
        />
      </section>
    )
  }

  return (
    <nav className="home-container mt-6 sm:mt-8" aria-label="Danh mục đồ chơi">
      <div className="relative rounded-2xl bg-white px-2 py-3 shadow-[0_1px_2px_rgb(18_23_31/0.05),0_1px_12px_-4px_rgb(18_23_31/0.06)] dark:bg-night-900 dark:shadow-none">
        <ul
          ref={scrollerRef}
          className="flex snap-x snap-proximity scroll-px-2 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-busy={result.isPending}
        >
          {result.isPending
            ? Array.from({ length: SKELETON_COUNT }, (_, index) => (
                <li key={index} className={ITEM} aria-hidden>
                  <span className={`${SKELETON} mx-auto mt-2 block size-16 rounded-2xl`} />
                  <span className={`${SKELETON} mx-auto mt-2 block h-3 w-16 rounded-full`} />
                </li>
              ))
            : result.data.map((category) => {
                const { icon: Icon, tone, image } = getCategoryVisual(category.slug)
                return (
                  <li key={category.id} className={ITEM}>
                    <Link
                      to={browseToysPath({ category: category.slug })}
                      className="group flex h-full flex-col items-center gap-2 rounded-xl px-1.5 py-2 text-center transition-colors duration-200 hover:bg-tf-surface-low focus-ring dark:hover:bg-night-800"
                    >
                      <span
                        className={`${ICON_BOX} transition-transform duration-300 ease-out-quint group-hover:-translate-y-0.5 group-hover:scale-105 [&_svg]:size-7 ${TONE_CLASSES[tone]}`}
                        aria-hidden
                      >
                        {image ? (
                          <img
                            src={image}
                            alt=""
                            className="size-12 object-contain drop-shadow-[0_2px_3px_rgb(18_23_31/0.12)]"
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <Icon />
                        )}
                      </span>
                      <span className="line-clamp-2 text-[13px] leading-4 font-medium text-site-ink dark:text-slate-100">
                        {category.name}
                      </span>
                      {category.toyCount !== undefined && (
                        <span className="-mt-1 text-[11px] text-site-muted">{category.toyCount} món</span>
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
            className={`${ARROW} -left-3`}
            aria-label="Xem danh mục trước"
            onClick={() => scrollByPage(-1)}
          >
            <ChevronLeft aria-hidden />
          </button>
        )}
        {canScrollNext && (
          <button
            type="button"
            className={`${ARROW} -right-3`}
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
