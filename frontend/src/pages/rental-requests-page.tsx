import { useQuery } from '@tanstack/react-query'
import { Pagination } from 'antd'
import { BadgeCheck, ChevronRight, Clock, Home, UserRound } from 'lucide-react'
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { z } from 'zod'

import { QueryErrorAlert } from '../components/common'
import { RentalPeriod, RentalStatusBadge, RentalThumb } from '../features/rentals/components/rental-parts'
import {
  rentalListQuery,
  RENTAL_GROUPS,
  RENTAL_REQUESTS_PAGE_SIZE,
  type RentalListRole,
  type RentalOrderItem,
  type RentalParty,
  type RentalRole,
  type RentalStatus,
} from '../features/rentals/rental-orders-api'
import { describeReturnDue, formatRemaining, RENTAL_GROUP_LABELS, useNow } from '../features/rentals/rental-display'
import { formatVnd } from '../features/toy-listings/format-vnd'
import { useListParams } from '../hooks/useListParams'
import { SiteLayout } from '../layouts/site/site-layout'
import { enumParam } from '../schemas/list-params'
import { getCurrentRole } from '../services/current-role'
import { myRentalPath, PATHS, rentalRequestPath } from '../routes/paths'

const listParamsSchema = z.object({
  group: enumParam(RENTAL_GROUPS),
  role: enumParam(['all']),
})

interface RoleView {
  title: string
  lead: string
  emptyText: string
  emptyAction: { to: string; label: string }
  /** Trạng thái người xem phải làm gì đó (vạch đồng trên hàng) */
  actions: Partial<Record<RentalStatus, string>>
  /** Trạng thái đang chờ bên kia, kèm đếm ngược */
  waits: Partial<Record<RentalStatus, string>>
  moneyLabel: string
}

/** Khác biệt giữa các tab: tiêu đề, đơn nào cần làm ngay, nhãn tiền */
const ROLE_VIEW: Record<RentalListRole, RoleView> = {
  owner: {
    title: 'Yêu cầu thuê nhận được',
    lead: 'Duyệt yêu cầu dựa trên điểm tin cậy của người thuê. Khi người thuê đã thanh toán, chụp ảnh tình trạng rồi xác nhận giao đồ; khi nhận lại, đối chiếu ảnh trước khi quyết toán cọc.',
    emptyText: 'Khi có người đặt thuê đồ chơi của bạn, yêu cầu sẽ hiện ở đây để bạn duyệt.',
    emptyAction: { to: PATHS.myListings, label: 'Xem tin đăng của tôi' },
    actions: { PENDING: 'Cần phản hồi', PAID: 'Cần giao đồ', RETURNING: 'Cần kiểm tra đồ trả' },
    waits: { ACCEPTED: 'Người thuê thanh toán', SHIPPING: 'Người thuê xác nhận nhận đồ' },
    moneyLabel: 'Người thuê trả',
  },
  renter: {
    title: 'Đơn thuê của tôi',
    lead: 'Thanh toán bằng ví ToyFlow khi chủ đồ chấp nhận, chụp ảnh tình trạng lúc nhận và lúc trả. Trả trễ hạn bị tính phí theo ngày, trừ vào tiền cọc.',
    emptyText: 'Chọn một món đồ chơi cho thuê, chọn ngày rồi gửi yêu cầu: đơn sẽ hiện ở đây.',
    emptyAction: { to: PATHS.toys, label: 'Tìm đồ chơi để thuê' },
    actions: { ACCEPTED: 'Cần thanh toán', SHIPPING: 'Cần xác nhận nhận đồ' },
    waits: { PENDING: 'Chủ đồ phản hồi', RETURNING: 'Chủ đồ kiểm tra đồ trả' },
    moneyLabel: 'Tổng thanh toán',
  },
  all: {
    title: 'Tất cả đơn thuê',
    lead: 'Toàn bộ đơn thuê trên ToyFlow, mới nhất trước. Mở một đơn để xem lịch sử và cách chia tiền giữa hai bên.',
    emptyText: 'Chưa có đơn thuê nào trên hệ thống.',
    emptyAction: { to: PATHS.home, label: 'Về trang chủ' },
    actions: {},
    waits: {},
    moneyLabel: 'Tổng thanh toán',
  },
}

/** Bước không có hạn chót: chủ đồ giao đồ sau khi người thuê trả tiền */
const UNTIMED_ACTIONS: readonly RentalStatus[] = ['PAID']

/** Đơn của chính người xem mở ở trang người thuê; còn lại (chủ đồ, quản trị viên) mở ở trang yêu cầu */
const detailPathOf = (item: RentalOrderItem) =>
  item.role === 'renter' ? myRentalPath(item.id) : rentalRequestPath(item.id)

function PartyName({ party, label }: { party: RentalParty; label: string }) {
  return (
    <span className="rental-row__party">
      {party.avatar ? (
        <img src={party.avatar} alt="" className="rental-row__avatar" loading="lazy" />
      ) : (
        <span className="rental-row__avatar rental-row__avatar--empty" aria-hidden="true">
          <UserRound />
        </span>
      )}
      <span className="sr-only">{label}: </span>
      <span className="rental-row__party-name">{party.fullName}</span>
      {party.verified && <BadgeCheck className="rental-row__verified" aria-label="Đã xác thực danh tính" />}
    </span>
  )
}

/** Bên còn lại của đơn; quản trị viên xem đơn không tham gia thì thấy cả hai bên */
function RowParties({ item }: { item: RentalOrderItem }) {
  if (item.counterpart) {
    const label = item.counterpart.role === 'owner' ? 'Chủ đồ' : 'Người thuê'
    return (
      <span className="rental-row__parties">
        <PartyName party={item.counterpart} label={label} />
      </span>
    )
  }
  if (!item.renter && !item.owner) return null
  return (
    <span className="rental-row__parties">
      {item.renter && <PartyName party={item.renter} label="Người thuê" />}
      {item.owner && <PartyName party={item.owner} label="Chủ đồ" />}
    </span>
  )
}

/**
 * Đơn đang thuê đếm theo hạn trả (hết ngày endDate) chứ không theo timer nhắc: người thuê thấy vạch đồng từ
 * ngày cuối, cả hai bên thấy chữ đỏ khi đã trễ (phí trễ đang cộng dồn vào cọc).
 */
function ReturnDueLine({ endDate, now, role }: { endDate: string; now: number; role: RentalListRole }) {
  const due = describeReturnDue(endDate, now)
  const label = role === 'renter' ? (due.late ? 'Quá hạn trả' : 'Hạn trả') : 'Người thuê trả đồ'
  const tone = due.late ? 'rental-row__due--late' : due.today && role === 'renter' ? '' : 'rental-row__due--quiet'
  return (
    <span className={`rental-row__due ${tone}`}>
      <Clock aria-hidden /> {label}, {due.text}
    </span>
  )
}

/** Một đơn thuê: ảnh + tên đồ chơi, bên còn lại, khoảng ngày, tiền, và hạn phải làm gì tiếp theo */
function RequestRow({ item, now, role }: { item: RentalOrderItem; now: number; role: RentalListRole }) {
  const view = ROLE_VIEW[role]
  const remaining = item.timer ? formatRemaining(item.timer.dueAt, now) : null
  const untimed = UNTIMED_ACTIONS.includes(item.status)
  const actionText = view.actions[item.status]
  const waitText = view.waits[item.status]
  const inUse = item.status === 'IN_USE'
  const returnDue = inUse ? describeReturnDue(item.period.endDate, now) : null
  // Người thuê cần trả đồ từ ngày cuối của kỳ thuê
  const needsAction =
    Boolean(actionText && (untimed || remaining)) ||
    (role === 'renter' && Boolean(returnDue && (returnDue.late || returnDue.today)))

  return (
    <li>
      <Link to={detailPathOf(item)} className={`rental-row ${needsAction ? 'rental-row--action' : ''}`}>
        <RentalThumb src={item.toy?.primaryImage} className="rental-row__thumb" />
        <span className="rental-row__main">
          <span className="rental-row__meta">
            <span className="rental-row__code">{item.code}</span>
            <RentalStatusBadge status={item.status} />
          </span>
          <span className="rental-row__title">{item.toy?.name ?? 'Tin đồ chơi đã ẩn hoặc bị xoá'}</span>
          <RowParties item={item} />
          {inUse ? (
            <ReturnDueLine endDate={item.period.endDate} now={now} role={role} />
          ) : needsAction ? (
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
          <RentalPeriod period={item.period} />
        </span>
        <span className="rental-row__money">
          <small>{view.moneyLabel}</small>
          <strong>{formatVnd(item.pricing.totalPayable)}</strong>
        </span>
        <ChevronRight className="rental-row__chevron" aria-hidden />
      </Link>
    </li>
  )
}

/** Tab vai: đơn mình thuê, đơn mình cho thuê, và (quản trị viên) tất cả đơn. Giữ nhóm đang lọc khi đổi tab. */
function RoleTabs({ active, group, isAdmin }: { active: RentalListRole; group: string | undefined; isAdmin: boolean }) {
  const withGroup = (path: string, extra?: Record<string, string>) => {
    const params = new URLSearchParams(extra)
    if (group) params.set('group', group)
    const query = params.toString()
    return query ? `${path}?${query}` : path
  }
  const tabs: { role: RentalListRole; label: string; to: string }[] = [
    { role: 'renter', label: 'Tôi thuê', to: withGroup(PATHS.myRentals) },
    { role: 'owner', label: 'Cho thuê', to: withGroup(PATHS.rentalRequests) },
    ...(isAdmin ? [{ role: 'all' as const, label: 'Tất cả', to: withGroup(PATHS.myRentals, { role: 'all' }) }] : []),
  ]
  return (
    <nav className="rental-roles" aria-label="Vai trò">
      {tabs.map((tab) => (
        <Link
          key={tab.role}
          to={tab.to}
          className="rental-roles__item"
          aria-current={tab.role === active ? 'page' : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}

/**
 * Lịch sử đơn thuê theo vai: tab Tôi thuê / Cho thuê (quản trị viên thêm Tất cả), lọc theo nhóm trạng thái.
 * Tab, nhóm và trang nằm trên URL để tải lại hay gửi link vẫn giữ nguyên.
 */
export function RentalOrdersListPage({ role: routeRole }: { role: RentalRole }) {
  const isAdmin = getCurrentRole() === 'ADMIN'
  const { page, filters, setFilter, setPage } = useListParams({
    schema: listParamsSchema,
    defaultLimit: RENTAL_REQUESTS_PAGE_SIZE,
  })
  // ?role=all chỉ có nghĩa với quản trị viên trên trang người thuê; còn lại theo đường dẫn
  const role: RentalListRole = isAdmin && routeRole === 'renter' && filters.role === 'all' ? 'all' : routeRole
  const group = filters.group ?? 'all'
  const view = ROLE_VIEW[role]
  const list = useQuery(rentalListQuery(role, { group, page }))
  const now = useNow()
  const items = list.data?.items ?? []
  const total = list.data?.total ?? 0

  useEffect(() => {
    document.title = `${view.title} | ToyFlow`
  }, [view.title])

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

        <RoleTabs active={role} group={filters.group} isAdmin={isAdmin} />

        <div className="rental-filter" role="tablist" aria-label="Lọc theo trạng thái">
          {RENTAL_GROUPS.map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={group === option}
              className="rental-filter__item"
              onClick={() => setFilter('group', option === 'all' ? undefined : option)}
            >
              {RENTAL_GROUP_LABELS[option]}
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
                {group !== 'all'
                  ? `Không có đơn nào trong nhóm “${RENTAL_GROUP_LABELS[group]}”.`
                  : 'Chưa có đơn thuê nào.'}
              </p>
              <p className="rental-empty__text">
                {group !== 'all' ? 'Thử chọn nhóm khác hoặc xem tất cả đơn.' : view.emptyText}
              </p>
              {group !== 'all' ? (
                <button type="button" className="rental-btn rental-btn--ghost" onClick={() => setFilter('group', undefined)}>
                  Xem tất cả đơn
                </button>
              ) : (
                <Link to={view.emptyAction.to} className="rental-btn rental-btn--ghost">
                  {view.emptyAction.label}
                </Link>
              )}
            </div>
          )}

          {items.length > 0 && (
            <ul className={`rental-list__items ${list.isPlaceholderData ? 'is-stale' : ''}`}>
              {items.map((item) => (
                <RequestRow key={item.id} item={item} now={now} role={role} />
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
              onChange={(next) => setPage(next)}
            />
          )}
        </section>
      </div>
    </SiteLayout>
  )
}
