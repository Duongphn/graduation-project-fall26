import { useQuery } from '@tanstack/react-query'
import { Pagination } from 'antd'
import { ChevronRight, Clock, Home } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { QueryErrorAlert } from '../components/common'
import { RentalPeriod, RentalStatusBadge, RentalToyImage, RentalToyTitle } from '../features/rentals/components/rental-parts'
import {
  ownerRentalsQuery,
  RENTAL_REQUESTS_PAGE_SIZE,
  RENTAL_STATUSES,
  type RentalOrder,
  type RentalStatus,
} from '../features/rentals/rental-orders-api'
import { formatRemaining, OWNER_STATUS_FILTERS, RENTAL_STATUS_META, useNow } from '../features/rentals/rental-display'
import { formatVnd } from '../features/toy-listings/format-vnd'
import { SiteLayout } from '../layouts/site/site-layout'
import { PATHS, rentalRequestPath } from '../routes/paths'

const parseStatus = (value: string | null): RentalStatus | undefined =>
  RENTAL_STATUSES.find((status) => status === value)

const parsePage = (value: string | null) => {
  const page = Number(value)
  return Number.isInteger(page) && page > 0 ? page : 1
}

/** Một yêu cầu thuê: ảnh + tên đồ chơi, khoảng ngày, tiền, và hạn phải làm gì tiếp theo */
function RequestRow({ order, now }: { order: RentalOrder; now: number }) {
  const remaining = order.timer ? formatRemaining(order.timer.dueAt, now) : null
  const needsAction = order.status === 'PENDING' && remaining

  return (
    <li>
      <Link to={rentalRequestPath(order.id)} className={`rental-row ${needsAction ? 'rental-row--action' : ''}`}>
        <RentalToyImage toyId={order.toyId} className="rental-row__thumb" />
        <span className="rental-row__main">
          <span className="rental-row__meta">
            <span className="rental-row__code">{order.code}</span>
            <RentalStatusBadge status={order.status} />
          </span>
          <RentalToyTitle toyId={order.toyId} className="rental-row__title" />
          {needsAction ? (
            <span className="rental-row__due">
              <Clock aria-hidden /> Cần phản hồi, {remaining}
            </span>
          ) : order.status === 'ACCEPTED' && remaining ? (
            <span className="rental-row__due rental-row__due--quiet">
              <Clock aria-hidden /> Người thuê thanh toán, {remaining}
            </span>
          ) : null}
        </span>
        <span className="rental-row__period">
          <RentalPeriod period={order.period} />
        </span>
        <span className="rental-row__money">
          <small>Người thuê trả</small>
          <strong>{formatVnd(order.pricing.totalPayable)}</strong>
        </span>
        <ChevronRight className="rental-row__chevron" aria-hidden />
      </Link>
    </li>
  )
}

/** Chủ đồ xem các yêu cầu thuê nhận được và mở từng đơn để duyệt (UC07) */
export function RentalRequestsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const status = parseStatus(searchParams.get('status'))
  const page = parsePage(searchParams.get('page'))
  const list = useQuery(ownerRentalsQuery({ status, page }))
  const now = useNow()
  const items = list.data?.items ?? []
  const total = list.data?.total ?? 0

  useEffect(() => {
    document.title = 'Yêu cầu thuê nhận được | ToyFlow'
  }, [])

  const setFilter = (next: { status?: RentalStatus; page?: number }) => {
    const params = new URLSearchParams()
    if (next.status) params.set('status', next.status)
    if (next.page && next.page > 1) params.set('page', String(next.page))
    setSearchParams(params)
  }

  return (
    <SiteLayout>
      <div className="home-container rental-page">
        <nav aria-label="Breadcrumb" className="rental-crumbs">
          <Link to={PATHS.home}>
            <Home aria-hidden /> Trang chủ
          </Link>
          <ChevronRight aria-hidden />
          <span aria-current="page">Yêu cầu thuê nhận được</span>
        </nav>

        <header className="rental-page__head">
          <p className="rental-page__eyebrow">Cho thuê đồ chơi</p>
          <h1 className="rental-page__title">Yêu cầu thuê nhận được</h1>
          <p className="rental-page__lead">
            Xem từng yêu cầu cùng điểm tin cậy của người thuê, rồi chấp nhận hoặc từ chối trước hạn phản hồi. Quá hạn,
            yêu cầu sẽ tự huỷ và lịch được mở lại.
          </p>
        </header>

        <div className="rental-filter" role="tablist" aria-label="Lọc theo trạng thái">
          <button
            type="button"
            role="tab"
            aria-selected={!status}
            className="rental-filter__item"
            onClick={() => setFilter({})}
          >
            Tất cả
          </button>
          {OWNER_STATUS_FILTERS.map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={status === option}
              className="rental-filter__item"
              onClick={() => setFilter({ status: option })}
            >
              {RENTAL_STATUS_META[option].label}
            </button>
          ))}
        </div>

        <section aria-label="Danh sách yêu cầu thuê" aria-busy={list.isFetching} className="rental-list">
          {list.isPending &&
            Array.from({ length: 3 }, (_, index) => <span key={index} aria-hidden className="rental-row-skeleton" />)}

          {list.isError && !list.data && <QueryErrorAlert error={list.error} onRetry={() => void list.refetch()} />}

          {list.isSuccess && items.length === 0 && (
            <div className="rental-empty">
              <p className="rental-empty__title">
                {status ? `Không có yêu cầu nào ở trạng thái “${RENTAL_STATUS_META[status].label}”.` : 'Chưa có yêu cầu thuê nào.'}
              </p>
              <p className="rental-empty__text">
                Khi có người đặt thuê đồ chơi của bạn, yêu cầu sẽ hiện ở đây để bạn duyệt.
              </p>
              <Link to={PATHS.myListings} className="rental-btn rental-btn--ghost">
                Xem tin đăng của tôi
              </Link>
            </div>
          )}

          {items.length > 0 && (
            <ul className={`rental-list__items ${list.isPlaceholderData ? 'is-stale' : ''}`}>
              {items.map((order) => (
                <RequestRow key={order.id} order={order} now={now} />
              ))}
            </ul>
          )}

          {total > RENTAL_REQUESTS_PAGE_SIZE && (
            <Pagination
              className="rental-list__pager"
              current={page}
              pageSize={RENTAL_REQUESTS_PAGE_SIZE}
              total={total}
              showSizeChanger={false}
              onChange={(next) => setFilter({ status, page: next })}
            />
          )}
        </section>
      </div>
    </SiteLayout>
  )
}
