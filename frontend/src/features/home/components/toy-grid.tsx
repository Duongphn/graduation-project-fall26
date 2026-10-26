import { ChevronDown, Loader2, WifiOff } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { getApiErrorMessage } from '../../../services/http-client'
import type { featuredRentalsQuery } from '../home-queries'
import { useCategoryLookup } from '../hooks/use-category-lookup'
import { useToyShowcase } from '../hooks/use-toy-showcase'
import { EmptyState } from './empty-state'
import { ToyCard, ToyCardSkeleton } from './toy-card'
import { ToyGridEmpty, type ToyGridEmptyContent } from './toy-grid-empty'

interface ToyGridProps {
  query: typeof featuredRentalsQuery
  listingType: 'rent' | 'sell'
  empty: ToyGridEmptyContent
}

/**
 * Lưới thẻ đồ chơi: 2 hàng đầu + nút "Xem thêm" (mỗi lần thêm 2 hàng).
 * Đủ trạng thái: đang tải (skeleton), lỗi (thử lại), chưa có tin (lời mời đăng tin), có dữ liệu.
 */
export function ToyGrid({ query: queryOptions, listingType, empty }: ToyGridProps) {
  const categoryById = useCategoryLookup()
  const { query, items, total, hasMore, isLoadingMore, placeholderCount, showMore } = useToyShowcase(queryOptions)
  const gridRef = useRef<HTMLDivElement>(null)
  // Vị trí thẻ đầu tiên của lượt "Xem thêm" vừa bấm — focus vào đó khi thẻ đã hiện (không cần render lại → ref)
  const pendingFocusIndex = useRef<number | null>(null)

  useEffect(() => {
    const index = pendingFocusIndex.current
    if (index === null || items.length <= index) return
    gridRef.current?.querySelectorAll<HTMLAnchorElement>('.toy-card__link')[index]?.focus()
    pendingFocusIndex.current = null
  }, [items.length])

  if (query.isPending) {
    return (
      <div className="toy-grid" aria-busy="true">
        {Array.from({ length: placeholderCount }, (_, index) => (
          <ToyCardSkeleton key={index} />
        ))}
      </div>
    )
  }

  if (query.isError) {
    return (
      <EmptyState
        variant="error"
        icon={WifiOff}
        title="Chưa tải được danh sách đồ chơi"
        description={getApiErrorMessage(query.error)}
        action={
          <button type="button" className="home-button home-button--outline" onClick={() => void query.refetch()}>
            Thử lại
          </button>
        }
      />
    )
  }

  if (items.length === 0) {
    return <ToyGridEmpty {...empty} ghostCount={placeholderCount} variant={listingType} />
  }

  const handleShowMore = () => {
    pendingFocusIndex.current = items.length
    showMore()
  }

  return (
    <>
      <div ref={gridRef} className="toy-grid">
        {items.map((toy) => (
          <ToyCard key={toy.id} toy={toy} category={categoryById.get(toy.categoryId)} />
        ))}
      </div>

      <div className="toy-grid__footer">
        <p className="toy-grid__count" aria-live="polite">
          Đang xem {items.length} / {total} đồ chơi
        </p>
        {hasMore && (
          <button
            type="button"
            className="home-button home-button--outline toy-grid__more"
            onClick={handleShowMore}
            disabled={isLoadingMore}
          >
            {isLoadingMore ? (
              <>
                <Loader2 className="animate-spin" aria-hidden /> Đang tải…
              </>
            ) : (
              <>
                Xem thêm <ChevronDown aria-hidden />
              </>
            )}
          </button>
        )}
      </div>
    </>
  )
}
