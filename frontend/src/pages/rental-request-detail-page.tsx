import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, BadgeCheck, Check, ChevronRight, Clock, Home, ShieldAlert, UserRound, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { QueryErrorAlert, ReasonModal } from '../components/common'
import { profileQuery } from '../features/profile/profile-queries'
import { RentalPeriod, RentalStatusBadge, RentalToyImage } from '../features/rentals/components/rental-parts'
import {
  rentalDetailQuery,
  rentalHistoryQuery,
  useOwnerRentalDecision,
  type RentalOrderDetail,
} from '../features/rentals/rental-orders-api'
import {
  formatDateTime,
  formatFullDate,
  formatRemaining,
  OWNER_REJECT_REASON_PRESETS,
  RENTAL_STATUS_META,
  useNow,
} from '../features/rentals/rental-display'
import { toyDetailQuery } from '../features/toy-catalog/toy-catalog-queries'
import { formatVnd } from '../features/toy-listings/format-vnd'
import { SiteLayout } from '../layouts/site/site-layout'
import { PATHS } from '../routes/paths'

const toyDetailPath = (toyId: string) => PATHS.toyDetail.replace(':toyId', toyId)

/** Người thuê như chủ đồ thấy: tên, đã xác thực danh tính chưa, điểm tin cậy */
function RenterCard({ renter }: { renter: RentalOrderDetail['renter'] }) {
  if (!renter) return null
  const score = renter.trustScore
  return (
    <section className="rental-renter" aria-labelledby="renter-title">
      <h2 id="renter-title" className="rental-section-title">
        Người thuê
      </h2>
      <div className="rental-renter__id">
        {renter.avatar ? (
          <img src={renter.avatar} alt="" className="rental-renter__avatar" />
        ) : (
          <span className="rental-renter__avatar rental-renter__avatar--empty" aria-hidden="true">
            <UserRound />
          </span>
        )}
        <span className="rental-renter__name">
          <strong>{renter.fullName}</strong>
          {renter.verified ? (
            <span className="rental-renter__verified">
              <BadgeCheck aria-hidden /> Đã xác thực danh tính
            </span>
          ) : (
            <span className="rental-renter__unverified">
              <ShieldAlert aria-hidden /> Chưa xác thực danh tính
            </span>
          )}
        </span>
      </div>
      <dl className="rental-renter__trust">
        <dt>Điểm tin cậy</dt>
        <dd>
          {score === undefined ? (
            <span className="rental-renter__no-score">Chưa có điểm</span>
          ) : (
            <strong>{score.toFixed(1)}</strong>
          )}
        </dd>
      </dl>
      <p className="rental-renter__hint">
        Điểm tính từ đánh giá của những người từng giao dịch với người thuê này.
      </p>
    </section>
  )
}

interface DecisionPanelProps {
  order: RentalOrderDetail
  isOwner: boolean
  now: number
}

/** Việc tiếp theo của chủ đồ theo trạng thái đơn; chỉ PENDING còn hạn mới có nút quyết định */
function DecisionPanel({ order, isOwner, now }: DecisionPanelProps) {
  const [rejectOpen, setRejectOpen] = useState(false)
  const { accept, reject } = useOwnerRentalDecision(order.id, order.toyId)
  const busy = accept.isPending || reject.isPending
  const remaining = order.timer ? formatRemaining(order.timer.dueAt, now) : null

  if (order.status === 'PENDING' && isOwner && remaining && order.timer) {
    return (
      <section className="rental-decision" aria-labelledby="decision-title">
        <p className="rental-decision__due">
          <Clock aria-hidden />
          Hạn phản hồi {formatDateTime(order.timer.dueAt)} · <strong>{remaining}</strong>
        </p>
        <h2 id="decision-title" className="rental-decision__title">
          Bạn có cho thuê không?
        </h2>
        <p className="rental-decision__text">
          Chấp nhận: người thuê được báo và phải thanh toán tiền thuê cùng tiền cọc vào ví ToyFlow trong thời hạn, nếu
          không đơn tự huỷ. Từ chối: bạn cần nêu lý do, lịch của món đồ được mở lại ngay.
        </p>
        <div className="rental-decision__actions">
          <button type="button" className="rental-btn rental-btn--primary" disabled={busy} onClick={() => accept.mutate()}>
            <Check aria-hidden /> {accept.isPending ? 'Đang chấp nhận…' : 'Chấp nhận'}
          </button>
          <button
            type="button"
            className="rental-btn rental-btn--ghost"
            disabled={busy}
            onClick={() => setRejectOpen(true)}
          >
            <X aria-hidden /> Từ chối
          </button>
        </div>
        <ReasonModal
          open={rejectOpen}
          title="Từ chối yêu cầu thuê"
          okText="Từ chối"
          label="Lý do từ chối (người thuê sẽ thấy)"
          presets={OWNER_REJECT_REASON_PRESETS}
          loading={reject.isPending}
          onCancel={() => setRejectOpen(false)}
          onSubmit={(reason) => reject.mutate(reason, { onSuccess: () => setRejectOpen(false) })}
        />
      </section>
    )
  }

  // Các trạng thái chỉ để xem: nói rõ đơn đang ở đâu và ai làm bước tiếp theo
  let title: string
  let text: string | null = null
  if (order.status === 'PENDING') {
    title = isOwner ? 'Đã quá hạn phản hồi' : 'Đang chờ chủ đồ duyệt'
    text = isOwner
      ? 'Yêu cầu sẽ được hệ thống tự huỷ và lịch của món đồ được mở lại.'
      : order.timer
        ? `Chủ đồ phản hồi trước ${formatDateTime(order.timer.dueAt)}.`
        : null
  } else if (order.status === 'ACCEPTED') {
    title = 'Đang chờ người thuê thanh toán'
    text =
      order.timer && remaining
        ? `Hạn thanh toán ${formatDateTime(order.timer.dueAt)} (${remaining}). Quá hạn, đơn tự huỷ và lịch được mở lại.`
        : 'Đã quá hạn thanh toán, đơn sẽ được hệ thống tự huỷ.'
  } else if (order.status === 'REJECTED') {
    title = 'Đã từ chối yêu cầu'
    text = order.rejectionReason ? `Lý do: ${order.rejectionReason}` : null
  } else if (order.status === 'EXPIRED') {
    title = 'Yêu cầu đã hết hạn'
    text = 'Đơn đã tự huỷ vì quá hạn phản hồi hoặc thanh toán. Lịch của món đồ đã được mở lại.'
  } else {
    title = `Đơn đang ở bước “${RENTAL_STATUS_META[order.status].label}”`
  }

  return (
    <section className={`rental-decision rental-decision--info rental-decision--${RENTAL_STATUS_META[order.status].tone}`}>
      <h2 className="rental-decision__title">{title}</h2>
      {text && <p className="rental-decision__text">{text}</p>}
    </section>
  )
}

/** Chủ đồ xem một yêu cầu thuê: người thuê + điểm tin cậy, chấp nhận hoặc từ chối kèm lý do (UC07) */
export function RentalRequestDetailPage() {
  const { orderId = '' } = useParams()
  const detail = useQuery(rentalDetailQuery(orderId))
  const history = useQuery(rentalHistoryQuery(orderId))
  const profile = useQuery(profileQuery)
  const order = detail.data
  const toy = useQuery({ ...toyDetailQuery(order?.toyId ?? ''), enabled: Boolean(order) })
  const now = useNow()
  const isOwner = Boolean(order && profile.data && order.ownerId === profile.data.id)

  useEffect(() => {
    document.title = `${order ? `Yêu cầu thuê ${order.code}` : 'Yêu cầu thuê'} | ToyFlow`
  }, [order])

  const pricing = order?.pricing
  const ownerReceives = pricing ? pricing.rentalFee - pricing.platformFee : 0

  return (
    <SiteLayout>
      <div className="home-container rental-page">
        <nav aria-label="Breadcrumb" className="rental-crumbs">
          <Link to={PATHS.home}>
            <Home aria-hidden /> Trang chủ
          </Link>
          <ChevronRight aria-hidden />
          <Link to={PATHS.rentalRequests}>Yêu cầu thuê nhận được</Link>
          {order && (
            <>
              <ChevronRight aria-hidden />
              <span aria-current="page">{order.code}</span>
            </>
          )}
        </nav>

        {detail.isPending && (
          <div className="rental-detail-skeleton" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        )}

        {detail.isError && (
          <div className="rental-detail-error">
            <QueryErrorAlert error={detail.error} onRetry={() => void detail.refetch()} />
            <Link to={PATHS.rentalRequests} className="rental-btn rental-btn--ghost">
              <ArrowLeft aria-hidden /> Về danh sách yêu cầu
            </Link>
          </div>
        )}

        {order && pricing && (
          <div className="rental-detail">
            <header className="rental-detail__head">
              <RentalToyImage toyId={order.toyId} className="rental-detail__thumb" />
              <div className="rental-detail__heading">
                <p className="rental-detail__meta">
                  <span className="rental-row__code">{order.code}</span>
                  <RentalStatusBadge status={order.status} />
                </p>
                <h1 className="rental-detail__title">
                  {toy.data ? (
                    <Link to={toyDetailPath(order.toyId)}>{toy.data.title}</Link>
                  ) : toy.isPending ? (
                    'Yêu cầu thuê đồ chơi'
                  ) : (
                    'Tin đồ chơi đã ẩn hoặc bị xoá'
                  )}
                </h1>
              </div>
            </header>

            <aside className="rental-detail__side">
              {isOwner && <RenterCard renter={order.renter} />}
              <DecisionPanel order={order} isOwner={isOwner} now={now} />
            </aside>

            <div className="rental-detail__main">
              <section className="rental-block" aria-labelledby="period-title">
                <h2 id="period-title" className="rental-section-title">
                  Thời gian thuê
                </h2>
                <div className="rental-detail__period">
                  <RentalPeriod period={order.period} />
                </div>
                <p className="rental-block__note">
                  Nhận ngày {formatFullDate(order.period.startDate)}, trả ngày {formatFullDate(order.period.endDate)}.
                </p>
              </section>

              <section className="rental-block" aria-labelledby="money-title">
                <h2 id="money-title" className="rental-section-title">
                  Chi phí
                </h2>
                <dl className="rental-money">
                  <div>
                    <dt>
                      Tiền thuê ({formatVnd(pricing.dailyRate)} × {pricing.days} ngày)
                    </dt>
                    <dd>{formatVnd(pricing.rentalFee)}</dd>
                  </div>
                  <div>
                    <dt>Tiền cọc (hoàn lại khi trả đồ)</dt>
                    <dd>{formatVnd(pricing.depositAmount)}</dd>
                  </div>
                  <div className="rental-money__total">
                    <dt>Người thuê thanh toán</dt>
                    <dd>{formatVnd(pricing.totalPayable)}</dd>
                  </div>
                </dl>
                {isOwner && (
                  <dl className="rental-money rental-money--owner">
                    <div>
                      <dt>Tiền thuê</dt>
                      <dd>{formatVnd(pricing.rentalFee)}</dd>
                    </div>
                    <div>
                      <dt>Phí nền tảng {Math.round(pricing.platformFeeRate * 1000) / 10}%</dt>
                      <dd>−{formatVnd(pricing.platformFee)}</dd>
                    </div>
                    <div className="rental-money__total">
                      <dt>Dự kiến bạn nhận khi hoàn tất</dt>
                      <dd>{formatVnd(ownerReceives)}</dd>
                    </div>
                  </dl>
                )}
                {isOwner && (
                  <p className="rental-block__note">
                    Tiền nằm trong ví ký quỹ ToyFlow cho đến khi bạn nhận lại đồ. Phí trả trễ (nếu có) được cộng thêm
                    cho bạn khi quyết toán.
                  </p>
                )}
              </section>

              <section className="rental-block" aria-labelledby="history-title">
                <h2 id="history-title" className="rental-section-title">
                  Lịch sử đơn
                </h2>
                {history.isError ? (
                  <QueryErrorAlert error={history.error} onRetry={() => void history.refetch()} />
                ) : history.isPending ? (
                  <span className="rental-skeleton-text" aria-hidden="true" />
                ) : (
                  <ol className="rental-history">
                    {history.data.map((entry, index) => (
                      <li key={`${entry.occurredAt}-${index}`}>
                        <span className="rental-history__dot" aria-hidden="true" />
                        <span className="rental-history__body">
                          <strong>{RENTAL_STATUS_META[entry.newStatus].label}</strong>
                          {entry.notes && <span>{entry.notes}</span>}
                        </span>
                        <time dateTime={entry.occurredAt}>{formatDateTime(entry.occurredAt)}</time>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>
          </div>
        )}
      </div>
    </SiteLayout>
  )
}
