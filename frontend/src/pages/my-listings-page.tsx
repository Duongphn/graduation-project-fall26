import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Home, PackageOpen, Plus } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { ListingPagination } from '../features/toy-listings/components/listing-pagination'
import { ListingStats } from '../features/toy-listings/components/listing-stats'
import { ListingStatusTabs } from '../features/toy-listings/components/listing-status-tabs'
import { donationToyStatesQuery } from '../features/donations/donor-queries'
import { MyListingRow } from '../features/toy-listings/components/my-listing-row'
import { parseMyListingsSearch, STATUS_LABELS } from '../features/toy-listings/listing-display'
import { getListingErrorMessage, isUnauthorizedError } from '../features/toy-listings/toy-listing-api'
import {
  categoriesQuery,
  listingCountsQuery,
  MY_LISTINGS_PAGE_SIZE,
  myListingsQuery,
} from '../features/toy-listings/toy-listing-queries'
import { AccountLayout } from '../layouts/account/account-layout'
import { PATHS } from '../routes/paths'

export function MyListingsPage() {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { status, page } = parseMyListingsSearch(searchParams)

  // Đã được loader của route tải sẵn vào cache
  const countsResult = useQuery(listingCountsQuery)
  const listingsResult = useQuery(myListingsQuery({ status, page }))
  const categoriesResult = useQuery(categoriesQuery)
  const categoryNames = new Map(categoriesResult.data?.map((category) => [category.id, category.name]))
  // Chỉ hỏi trạng thái quyên góp khi trang có tin tặng
  const hasDonationPosts = Boolean(listingsResult.data?.items.some((listing) => listing.listingType === 'donate'))
  const donationStates = useQuery({ ...donationToyStatesQuery, enabled: hasDonationPosts }).data

  useEffect(() => {
    document.title = 'Tin đăng của tôi - ToyFlow'
  }, [])

  const hrefForPage = (target: number) => {
    const params = new URLSearchParams()
    if (status) params.set('status', status)
    if (target > 1) params.set('page', String(target))
    return `?${params.toString()}`
  }

  const loadError = listingsResult.error ?? countsResult.error
  const listings = listingsResult.data

  return (
    <AccountLayout activeItem="listings">
      <nav aria-label="Breadcrumb" className="tf-breadcrumb">
        <Link to={PATHS.home} className="tf-breadcrumb__link">
          <Home aria-hidden /> Trang chủ
        </Link>
        <ChevronRight aria-hidden />
        <span aria-current="page" className="tf-breadcrumb__current">
          Tin đăng của tôi
        </span>
      </nav>

      <header className="listings-header">
        <div className="listings-header__text">
          <h1 className="listings-header__title">Tin đăng của tôi</h1>
          <p className="listings-header__lead">
            Quản lý toàn bộ đồ chơi bạn đang cho thuê hoặc bán lại trên ToyFlow và theo dõi trạng thái kiểm duyệt của từng tin.
          </p>
        </div>
        <Link to={PATHS.newListing} className="tf-btn tf-btn--primary tf-btn--inline">
          <Plus aria-hidden />
          Đăng tin mới
        </Link>
      </header>

      <ListingStats counts={countsResult.data} />

      <div className="listings-toolbar">
        <ListingStatusTabs current={status} counts={countsResult.data} />
      </div>

      {loadError ? (
        <div className="tf-card load-state load-state--error" role="alert">
          <p>{getListingErrorMessage(loadError)}</p>
          {isUnauthorizedError(loadError) ? (
            <Link to={PATHS.login} state={{ from: location.pathname + location.search }} className="tf-btn tf-btn--primary tf-btn--inline">
              Đăng nhập
            </Link>
          ) : (
            <button
              type="button"
              className="tf-btn tf-btn--soft tf-btn--inline"
              onClick={() => void Promise.all([listingsResult.refetch(), countsResult.refetch()])}
            >
              Thử lại
            </button>
          )}
        </div>
      ) : !listings ? (
        <div className="tf-card load-state">Đang tải tin đăng...</div>
      ) : listings.items.length === 0 ? (
        <div className="listings-empty">
          <PackageOpen aria-hidden />
          <p className="listings-empty__title">
            {page > 1
              ? 'Trang này không còn tin đăng nào.'
              : status
                ? `Chưa có tin nào ở trạng thái "${STATUS_LABELS[status]}".`
                : 'Bạn chưa đăng tin nào.'}
          </p>
          {page > 1 ? (
            <Link to={hrefForPage(1)} className="tf-btn tf-btn--soft tf-btn--inline">
              Về trang đầu
            </Link>
          ) : (
            <Link to={PATHS.newListing} className="tf-btn tf-btn--primary tf-btn--inline">
              <Plus aria-hidden />
              Đăng tin đầu tiên
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="listings-list">
            {listings.items.map((listing) => (
              <MyListingRow
                key={listing.id}
                listing={listing}
                categoryName={categoryNames.get(listing.categoryId)}
                donationState={listing.listingType === 'donate' ? donationStates?.[listing.id] : undefined}
              />
            ))}
          </div>
          <ListingPagination page={page} pageSize={MY_LISTINGS_PAGE_SIZE} total={listings.total} hrefFor={hrefForPage} />
        </>
      )}
    </AccountLayout>
  )
}
