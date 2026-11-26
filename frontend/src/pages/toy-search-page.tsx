import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { ChevronRight, Home, Search, SlidersHorizontal } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AdvisorFloatingChat } from '../features/ai-chat/components/advisor-floating-chat'
import { ActiveFilterChips } from '../features/toy-catalog/components/active-filter-chips'
import { CatalogPagination } from '../features/toy-catalog/components/catalog-pagination'
import { EmptySuggestions } from '../features/toy-catalog/components/empty-suggestions'
import { FilterDrawer } from '../features/toy-catalog/components/filter-drawer'
import { SortSelect } from '../features/toy-catalog/components/filter-fields'
import { FilterPanel } from '../features/toy-catalog/components/filter-panel'
import { AgeChips, TypeSwitch } from '../features/toy-catalog/components/quick-filters'
import { ToyCard, ToyCardSkeleton } from '../features/toy-catalog/components/toy-card'
import {
  countActiveFilters,
  distanceFromFilter,
  parseCatalogSearch,
  toCatalogSearch,
} from '../features/toy-catalog/catalog-search-params'
import type { CatalogFilters } from '../features/toy-catalog/toy-catalog-api'
import { toySearchQuery } from '../features/toy-catalog/toy-catalog-queries'
import { categoriesQuery } from '../features/toy-listings/toy-listing-queries'
import { SiteLayout } from '../layouts/site/site-layout'
import { PATHS } from '../routes/paths'
import { getApiErrorMessage } from '../services/http-client'

const countFormatter = new Intl.NumberFormat('vi-VN')

const SEARCH_FAILED_TEXT = 'Hệ thống tìm kiếm đang gặp sự cố. Bạn thử lại sau ít phút nhé.'

/** A server failure gets a fixed Vietnamese text; other errors (network, 4xx) keep their message. */
const searchErrorText = (error: unknown) =>
  isAxiosError(error) && (error.response?.status ?? 0) >= 500 ? SEARCH_FAILED_TEXT : getApiErrorMessage(error)

function ResultSummary({
  total,
  keyword,
  failed,
}: {
  total: number | undefined
  keyword: string | undefined
  failed: boolean
}) {
  if (failed) return <>Chưa tải được kết quả</>
  if (total === undefined) return <>Đang tìm…</>
  return (
    <>
      Tìm thấy <strong>{countFormatter.format(total)}</strong> đồ chơi
      {keyword && (
        <>
          {' '}
          cho “<strong>{keyword}</strong>”
        </>
      )}
    </>
  )
}

export function ToySearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = useMemo(() => parseCatalogSearch(searchParams), [searchParams])
  // Giữ kết quả cũ trên màn hình trong lúc tải bộ lọc mới, tránh lưới bị trống chớp nháy
  const search = useQuery({
    ...toySearchQuery(filters),
    placeholderData: keepPreviousData,
  })
  const categories = useQuery(categoriesQuery).data ?? []
  const [drawerOpen, setDrawerOpen] = useState(false)
  const resultsRef = useRef<HTMLElement>(null)

  const activeCount = countActiveFilters(filters)
  const total = search.data?.total
  const searchFailed = search.isError && !search.data
  // Bản nháp trong panel làm mới mỗi khi bộ lọc trên URL đổi (gỡ chip, bấm gợi ý, nút Back)
  const panelKey = toCatalogSearch({
    ...filters,
    page: 1,
    sort: undefined,
    limit: undefined,
  }).toString()

  /** Mọi thay đổi bộ lọc đưa về trang 1 */
  const updateFilters = (patch: Partial<CatalogFilters>) => {
    setSearchParams(toCatalogSearch({ ...filters, ...patch, page: 1 }))
  }

  const submitKeyword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const keyword = String(new FormData(event.currentTarget).get('q') ?? '').trim()
    updateFilters({
      q: keyword || undefined,
      sort: filters.sort === 'relevance' && !keyword ? undefined : filters.sort,
    })
  }

  // Chuyển trang thì đưa đầu danh sách kết quả vào tầm nhìn
  const previousPage = useRef(filters.page)
  useEffect(() => {
    if (previousPage.current !== filters.page) resultsRef.current?.scrollIntoView({ block: 'start' })
    previousPage.current = filters.page
  }, [filters.page])

  useEffect(() => {
    document.title = filters.q ? `“${filters.q}” | Tìm đồ chơi | ToyFlow` : 'Tìm đồ chơi | ToyFlow'
  }, [filters.q])

  let results
  if (search.isPending) {
    results = (
      <ul className="catalog-grid" aria-label="Đang tải kết quả">
        {Array.from({ length: 6 }, (_, index) => (
          <li key={index}>
            <ToyCardSkeleton />
          </li>
        ))}
      </ul>
    )
  } else if (searchFailed) {
    results = (
      <div className="catalog-empty" role="alert">
        <h2 className="catalog-empty__title">Chưa tải được danh sách.</h2>
        <p className="catalog-empty__text">{searchErrorText(search.error)}</p>
        <button type="button" className="pl-btn pl-btn--ghost" onClick={() => void search.refetch()}>
          Thử lại
        </button>
      </div>
    )
  } else if (search.data.items.length === 0 && search.data.total > 0) {
    // Trang trên URL vượt quá số trang hiện có (vd. vừa có tin bị ẩn)
    results = (
      <div className="catalog-empty">
        <h2 className="catalog-empty__title">Trang này không còn món nào.</h2>
        <Link to={`?${toCatalogSearch({ ...filters, page: 1 })}`} className="pl-btn pl-btn--ghost">
          Về trang đầu
        </Link>
      </div>
    )
  } else if (search.data.items.length === 0) {
    results = <EmptySuggestions filters={filters} suggestions={search.data.suggestions} onChange={updateFilters} />
  } else {
    results = (
      <>
        <ul className={search.isPlaceholderData ? 'catalog-grid is-stale' : 'catalog-grid'}>
          {search.data.items.map((toy, index) => (
            <li key={toy.id}>
              <ToyCard toy={toy} index={index} distanceKm={distanceFromFilter(filters, toy)} />
            </li>
          ))}
        </ul>
        <CatalogPagination
          filters={filters}
          total={search.data.total}
          onPageSizeChange={(limit) => updateFilters({ limit })}
        />
      </>
    )
  }

  return (
    <SiteLayout>
      <div className="home-container catalog-page py-5 sm:py-7">
        <nav aria-label="Breadcrumb" className="tf-breadcrumb">
          <Link to={PATHS.home} className="tf-breadcrumb__link">
            <Home aria-hidden /> Trang chủ
          </Link>
          <ChevronRight aria-hidden />
          <span aria-current="page" className="tf-breadcrumb__current">
            Tìm đồ chơi
          </span>
        </nav>

        {/* Đầu trang gọn: tiêu đề + ô tìm cùng hàng để danh sách lên sớm trong màn hình đầu.
            Nút đăng tin đã có trên header nên không lặp lại ở đây. */}
        <header className="catalog-hero">
          <div className="catalog-hero__text">
            <h1 className="catalog-hero__title">Tìm đồ chơi cho bé</h1>
            <p className="catalog-hero__lead">Thuê theo ngày từ các gia đình gần bạn, hoặc mua lại đồ còn tốt.</p>
          </div>

          <form role="search" className="catalog-search" onSubmit={submitKeyword}>
            <label htmlFor="catalog-keyword" className="sr-only">
              Tìm đồ chơi theo tên
            </label>
            <Search className="catalog-search__icon" aria-hidden="true" />
            <input
              key={filters.q ?? ''}
              id="catalog-keyword"
              name="q"
              type="search"
              className="catalog-search__input"
              defaultValue={filters.q}
              placeholder="Lego, xe điều khiển, búp bê…"
              autoComplete="off"
              enterKeyHint="search"
            />
            <button type="submit" className="catalog-search__submit">
              Tìm
            </button>
          </form>
        </header>

        {/* Hàng lọc nhanh: loại tin + độ tuổi, một chạm là áp dụng */}
        <div className="catalog-quick">
          <TypeSwitch filters={filters} />
          <AgeChips filters={filters} onChange={updateFilters} />
        </div>

        <div className="catalog-layout">
          <aside className="catalog-sidebar" aria-label="Bộ lọc">
            <FilterPanel key={panelKey} filters={filters} categories={categories} onChange={updateFilters} />
          </aside>

          <section
            ref={resultsRef}
            className="catalog-results"
            aria-labelledby="catalog-results-title"
            aria-busy={search.isFetching}
          >
            <div className="catalog-results__head">
              <h2 id="catalog-results-title" className="catalog-results__count" aria-live="polite">
                <ResultSummary total={total} keyword={filters.q} failed={searchFailed} />
              </h2>

              <div className="catalog-results__tools">
                <button type="button" className="catalog-filter-toggle" onClick={() => setDrawerOpen(true)}>
                  <SlidersHorizontal aria-hidden="true" />
                  Giá, danh mục
                  {activeCount > 0 && <span className="catalog-filter-toggle__count">{activeCount}</span>}
                </button>
                <div className="catalog-sort">
                  <SortSelect filters={filters} onChange={updateFilters} />
                </div>
              </div>

              <ActiveFilterChips filters={filters} categories={categories} onChange={updateFilters} />
            </div>

            {results}
          </section>
        </div>

        {/* Màn hẹp: mỗi lựa chọn áp dụng ngay, kết quả cập nhật phía sau; nút cuối chỉ để đóng */}
        <FilterDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
          <FilterPanel
            key={panelKey}
            filters={filters}
            categories={categories}
            onChange={updateFilters}
            footer={
              <button type="button" className="pl-btn pl-btn--primary filter-panel__apply" onClick={() => setDrawerOpen(false)}>
                {total === undefined ? 'Xem kết quả' : `Xem ${countFormatter.format(total)} đồ chơi`}
              </button>
            }
          />
        </FilterDrawer>
      </div>

      <AdvisorFloatingChat />
    </SiteLayout>
  )
}
