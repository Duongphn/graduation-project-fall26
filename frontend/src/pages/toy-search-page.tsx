import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ChevronRight, Home, Plus, Search, SlidersHorizontal } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ActiveFilterChips } from '../features/toy-catalog/components/active-filter-chips'
import { CatalogPagination } from '../features/toy-catalog/components/catalog-pagination'
import { EmptySuggestions } from '../features/toy-catalog/components/empty-suggestions'
import { FilterDrawer } from '../features/toy-catalog/components/filter-drawer'
import { SortSelect } from '../features/toy-catalog/components/filter-fields'
import { FilterPanel } from '../features/toy-catalog/components/filter-panel'
import { ListingTypeTabs } from '../features/toy-catalog/components/listing-type-tabs'
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
import { AccountLayout } from '../layouts/account/account-layout'
import { PATHS } from '../routes/paths'
import { getApiErrorMessage } from '../services/http-client'

const countFormatter = new Intl.NumberFormat('vi-VN')

function ResultSummary({ total, keyword }: { total: number | undefined; keyword: string | undefined }) {
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
  } else if (search.isError && !search.data) {
    results = (
      <div className="catalog-empty" role="alert">
        <h2 className="catalog-empty__title">Chưa tải được danh sách.</h2>
        <p className="catalog-empty__text">{getApiErrorMessage(search.error)}</p>
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
    <AccountLayout activeItem="browse">
      <div className="catalog-page">
        <nav aria-label="Breadcrumb" className="tf-breadcrumb">
          <Link to={PATHS.home} className="tf-breadcrumb__link">
            <Home aria-hidden /> Trang chủ
          </Link>
          <ChevronRight aria-hidden />
          <span aria-current="page" className="tf-breadcrumb__current">
            Tìm đồ chơi
          </span>
        </nav>

        {/* Cùng thẻ đầu trang với "Đăng tin đồ chơi" (.editor-header); thanh tab + ô tìm bên dưới như "Tin đăng của tôi" */}
        <header className="tf-card editor-header">
          <div className="editor-header__text">
            <div className="editor-header__title-row">
              <h1 className="editor-header__title">Tìm đồ chơi</h1>
              {total !== undefined && (
                <span className="tf-pill tf-pill--secondary">
                  <span className="tf-pill__pulse" aria-hidden />
                  {countFormatter.format(total)} món phù hợp
                </span>
              )}
            </div>
            <p className="editor-header__lead">
              Thuê theo ngày hoặc mua lại đồ chơi từ các gia đình khác. Lọc theo độ tuổi, giá và khu vực để chọn món hợp
              với bé.
            </p>
          </div>
          <Link to={PATHS.newListing} className="tf-btn tf-btn--primary tf-btn--inline catalog-head__post">
            <Plus aria-hidden />
            Đăng tin mới
          </Link>
        </header>

        <div className="listings-toolbar catalog-toolbar">
          <ListingTypeTabs filters={filters} />

          <form role="search" className="catalog-search" onSubmit={submitKeyword}>
            <div className="catalog-search__field">
              <label htmlFor="catalog-keyword" className="sr-only">
                Tìm đồ chơi theo tên
              </label>
              <Search className="catalog-search__icon" aria-hidden="true" />
              <input
                key={filters.q ?? ''}
                id="catalog-keyword"
                name="q"
                type="search"
                className="tf-input"
                defaultValue={filters.q}
                placeholder="Lego, xe điều khiển, búp bê…"
                autoComplete="off"
                enterKeyHint="search"
              />
            </div>
            <button type="submit" className="tf-btn tf-btn--primary tf-btn--inline catalog-search__submit">
              Tìm
            </button>
          </form>
        </div>

        <div className="catalog-layout">
          <section
            ref={resultsRef}
            className="catalog-results"
            aria-labelledby="catalog-results-title"
            aria-busy={search.isFetching}
          >
            {/* Số kết quả và sắp xếp luôn chung một hàng; chip lọc xuống hàng riêng để không đẩy ô sắp xếp */}
            <div className="catalog-results__head">
              <h2 id="catalog-results-title" className="catalog-results__count" aria-live="polite">
                <ResultSummary total={total} keyword={filters.q} />
              </h2>

              <div className="catalog-results__tools">
                <button type="button" className="catalog-filter-toggle" onClick={() => setDrawerOpen(true)}>
                  <SlidersHorizontal aria-hidden="true" />
                  Bộ lọc
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

          <aside className="catalog-sidebar" aria-label="Bộ lọc">
            <FilterPanel key={panelKey} filters={filters} categories={categories} onApply={updateFilters} />
          </aside>
        </div>

        <FilterDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
          <FilterPanel
            key={panelKey}
            filters={filters}
            categories={categories}
            onApply={(patch) => {
              updateFilters(patch)
              setDrawerOpen(false)
            }}
          />
        </FilterDrawer>
      </div>
    </AccountLayout>
  )
}
