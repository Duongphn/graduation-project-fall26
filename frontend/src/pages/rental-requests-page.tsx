import { useQuery } from '@tanstack/react-query'
import { Pagination } from 'antd'
import { ChevronRight, Clock, Home } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { QueryErrorAlert } from '../components/common'
import { RentalPeriod, RentalStatusBadge, RentalToyImage, RentalToyTitle } from '../features/rentals/components/rental-parts'
import {
  rentalListQuery,
  RENTAL_REQUESTS_PAGE_SIZE,
  RENTAL_STATUSES,
  type RentalOrder,
  type RentalRole,
  type RentalStatus,
} from '../features/rentals/rental-orders-api'
import { formatRemaining, OWNER_STATUS_FILTERS, RENTAL_STATUS_META, RENTER_STATUS_FILTERS, useNow } from '../features/rentals/rental-display'
import { formatVnd } from '../features/toy-listings/format-vnd'
import { SiteLayout } from '../layouts/site/site-layout'
import { myRentalPath, PATHS, rentalRequestPath } from '../routes/paths'

const parseStatus = (value: string | null): RentalStatus | undefined =>
  RENTAL_STATUSES.find((status) => status === value)

const parsePage = (value: string | null) => {
  const page = Number(value)
  return Number.isInteger(page) && page > 0 ? page : 1
}

interface RoleView {
  title: string
  lead: string
  filters: readonly RentalStatus[]
  detailPath: (orderId: string) => string
  emptyText: string
  emptyAction: { to: string; label: string }
  /** Trạng thái người xem phải làm gì đó (vạch đồng trên hàng) */
  actions: Partial<Record<RentalStatus, string>>
  /** Trạng thái đang chờ bên kia, kèm đếm ngược */
  waits: Partial<Record<RentalStatus, string>>
  moneyLabel: string
}

/** Khác biệt giữa trang của chủ đồ và của người thuê: tiêu đề, bộ lọc, đơn nào cần làm ngay */
const ROLE_VIEW: Record<RentalRole, RoleView> = {
  owner: {
    title: 'Yêu cầu thuê nhận được',
    lead: 'Duyệt yêu cầu dựa trên điểm tin cậy của người thuê trước hạn phản hồi. Khi người thuê đã thanh toán, chụp ảnh tình trạng rồi xác nhận giao đồ.',
    filters: OWNER_STATUS_FILTERS,
    detailPath: rentalRequestPath,
    emptyText: 'Khi có người đặt thuê đồ chơi của bạn, yêu cầu sẽ hiện ở đây để bạn duyệt.',
    emptyAction: { to: PATHS.myListings, label: 'Xem tin đăng của tôi' },
    actions: { PENDING: 'Cần phản hồi', PAID: 'Cần giao đồ' },
    waits: { ACCEPTED: 'Người thuê thanh toán', SHIPPING: 'Người thuê xác nhận nhận đồ' },
    moneyLabel: 'Người thuê trả',
  },
  renter: {
    title: 'Đơn thuê của tôi',
    lead: 'Thanh toán bằng ví ToyFlow khi chủ đồ chấp nhận. Khi nhận được đồ, chụp ảnh tình trạng rồi xác nhận để bắt đầu tính thời gian thuê.',
    filters: RENTER_STATUS_FILTERS,
    detailPath: myRentalPath,
    emptyText: 'Chọn một món đồ chơi cho thuê, chọn ngày rồi gửi yêu cầu: đơn sẽ hiện ở đây.',
    emptyAction: { to: PATHS.toys, label: 'Tìm đồ chơi để thuê' },
    actions: { ACCEPTED: 'Cần thanh toán', SHIPPING: 'Cần xác nhận nhận đồ' },
    waits: { PENDING: 'Chủ đồ phản hồi' },
    moneyLabel: 'Tổng thanh toán',
  },
}

/** Bước không có hạn chót: chủ đồ giao đồ sau khi người thuê trả tiền */
const UNTIMED_ACTIONS: readonly RentalStatus[] = ['PAID']

/** Một đơn thuê: ảnh + tên đồ chơi, khoảng ngày, tiền, và hạn phải làm gì tiếp theo */
function RequestRow({ order, now, role }: { order: RentalOrder; now: number; role: RentalRole }) {
  const view = ROLE_VIEW[role]
  const remaining = order.timer ? formatRemaining(order.timer.dueAt, now) : null
  const untimed = UNTIMED_ACTIONS.includes(order.status)
  const actionText = view.actions[order.status]
  const waitText = view.waits[order.status]
  const needsAction = Boolean(actionText && (untimed || remaining))

  return (
    <li>
      <Link to={view.detailPath(order.id)} className={`rental-row ${needsAction ? 'rental-row--action' : ''}`}>
        <RentalToyImage toyId={order.toyId} className="rental-row__thumb" />
        <span className="rental-row__main">
          <span className="rental-row__meta">
            <span className="rental-row__code">{order.code}</span>
            <RentalStatusBadge status={order.status} />
          </span>
          <RentalToyTitle toyId={order.toyId} className="rental-row__title" />
          {needsAction ? (
            <span className="rental-row__due">
              <Clock aria-hidden /> {actionText}
              {!untimed && remaining && `, ${remaining}`}
            </span>
          ) : waitText && remaining ? (
            <span className="rental-row__due rental-row__due--quiet">
              <Clock aria-hidden /> {waitText}, {remaining}
            </span>
          ) : null}
        </span>
        <span className="rental-row__period">
          <RentalPeriod period={order.period} />
        </span>
        <span className="rental-row__money">
          <small>{view.moneyLabel}</small>
          <strong>{formatVnd(order.pricing.totalPayable)}</strong>
        </span>
        <ChevronRight className="rental-row__chevron" aria-hidden />
      </Link>
    </li>
  )
}

/**
 * Danh sách đơn thuê theo vai trò: chủ đồ duyệt yêu cầu nhận được (UC07),
 * người thuê theo dõi đơn đã gửi và vào thanh toán (UC08); hai bên bàn giao đồ chơi (UC09).
 */
export function RentalOrdersListPage({ role }: { role: RentalRole }) {
  const view = ROLE_VIEW[role]
  const [searchParams, setSearchParams] = useSearchParams()
  const status = parseStatus(searchParams.get('status'))
  const page = parsePage(searchParams.get('page'))
  const list = useQuery(rentalListQuery(role, { status, page }))
  const now = useNow()
  const items = list.data?.items ?? []
  const total = list.data?.total ?? 0

  useEffect(() => {
    document.title = `${view.title} | ToyFlow`
  }, [view.title])

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
          <span aria-current="page">{view.title}</span>
        </nav>

        <header className="rental-page__head">
          <h1 className="rental-page__title">{view.title}</h1>
          <p className="rental-page__lead">{view.lead}</p>
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
          {view.filters.map((option) => (
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

        <section aria-label={view.title} aria-busy={list.isFetching} className="rental-list">
          {list.isPending &&
            Array.from({ length: 3 }, (_, index) => <span key={index} aria-hidden className="rental-row-skeleton" />)}

          {list.isError && !list.data && <QueryErrorAlert error={list.error} onRetry={() => void list.refetch()} />}

          {list.isSuccess && items.length === 0 && (
            <div className="rental-empty">
              <p className="rental-empty__title">
                {status ? `Không có đơn nào ở trạng thái “${RENTAL_STATUS_META[status].label}”.` : 'Chưa có đơn thuê nào.'}
              </p>
              <p className="rental-empty__text">{view.emptyText}</p>
              <Link to={view.emptyAction.to} className="rental-btn rental-btn--ghost">
                {view.emptyAction.label}
              </Link>
            </div>
          )}

          {items.length > 0 && (
            <ul className={`rental-list__items ${list.isPlaceholderData ? 'is-stale' : ''}`}>
              {items.map((order) => (
                <RequestRow key={order.id} order={order} now={now} role={role} />
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
