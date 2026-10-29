import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, BadgeCheck, Check, ChevronRight, Clock, Home, ShieldAlert, UserRound, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { QueryErrorAlert, ReasonModal } from '../components/common'
import { profileQuery } from '../features/profile/profile-queries'
import { RentalPeriod, RentalStatusBadge, RentalToyImage } from '../features/rentals/components/rental-parts'
import { RentalHandoverPanel, RentalHandoverRecord } from '../features/rentals/components/rental-handover-panel'
import { RentalPayPanel } from '../features/rentals/components/rental-pay-panel'
import { RentalReturnPanel, RentalReturnRecord } from '../features/rentals/components/rental-return-panel'
import { RentalSettlePanel, RentalSettlementRecord } from '../features/rentals/components/rental-settle-panel'
import {
  rentalDetailQuery,
  rentalHistoryQuery,
  useOwnerRentalDecision,
  type RentalOrderDetail,
} from '../features/rentals/rental-orders-api'
import {
  describeReturnDue,
  estimateLateFee,
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
  isRenter: boolean
  now: number
}

/**
 * Việc tiếp theo theo trạng thái đơn và vai trò người xem: chủ đồ duyệt khi PENDING còn hạn,
 * người thuê thanh toán khi ACCEPTED còn hạn, chủ đồ giao khi PAID, người thuê xác nhận nhận khi
 * SHIPPING còn hạn (UC09), người thuê gửi trả khi IN_USE (UC10), chủ đồ quyết toán khi RETURNING (UC11);
 * các trạng thái khác chỉ để xem.
 */
function DecisionPanel({ order, isOwner, isRenter, now }: DecisionPanelProps) {
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

  if (order.status === 'ACCEPTED' && isRenter && remaining) {
    return <RentalPayPanel order={order} remaining={remaining} />
  }

  if (order.status === 'PAID' && isOwner) {
    return <RentalHandoverPanel order={order} step="ship" />
  }

  if (order.status === 'SHIPPING' && isRenter && remaining) {
    return <RentalHandoverPanel order={order} step="receive" remaining={remaining} />
  }

  if (order.status === 'IN_USE' && isRenter) {
    return <RentalReturnPanel order={order} now={now} />
  }

  if (order.status === 'RETURNING' && isOwner) {
    return <RentalSettlePanel order={order} remaining={remaining} />
  }

  if (order.status === 'IN_USE') {
    const due = describeReturnDue(order.period.endDate, now)
    const { lateDays, lateFee } = estimateLateFee(order, now)
    return (
      <section
        className={`rental-decision rental-decision--info rental-decision--${due.late ? 'alert' : 'go'}`}
        aria-labelledby="decision-title"
      >
        <h2 id="decision-title" className="rental-decision__title">
          {due.late ? 'Người thuê đã quá hạn trả' : 'Người thuê đang sử dụng đồ chơi'}
        </h2>
        <dl className="rental-term">
          {order.rentalStartedAt && (
            <div>
              <dt>Bắt đầu tính</dt>
              <dd>{formatDateTime(order.rentalStartedAt)}</dd>
            </div>
          )}
          <div>
            <dt>Hạn trả</dt>
            <dd>
              Hết ngày {formatFullDate(order.period.endDate)}
              <span className={`rental-term__due ${due.late ? 'is-late' : ''}`}>{due.text}</span>
            </dd>
          </div>
        </dl>
        <p className="rental-decision__text">
          {due.late
            ? `Hệ thống đã nhắc người thuê. Phí trả trễ đang là ${formatVnd(lateFee)} (${lateDays} ngày), trừ vào tiền cọc và cộng cho bạn khi quyết toán.`
            : order.handover?.autoConfirmed
              ? 'Người thuê không xác nhận trước hạn nên hệ thống đã tự xác nhận nhận hàng. Bạn sẽ được báo khi người thuê gửi trả đồ.'
              : 'Bạn sẽ được báo khi người thuê gửi trả đồ.'}
        </p>
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
    title = isRenter ? 'Đã quá hạn thanh toán' : 'Đang chờ người thuê thanh toán'
    text =
      order.timer && remaining
        ? `Hạn thanh toán ${formatDateTime(order.timer.dueAt)} (${remaining}). Quá hạn, đơn tự huỷ và lịch được mở lại.`
        : 'Đã quá hạn thanh toán, đơn sẽ được hệ thống tự huỷ.'
  } else if (order.status === 'PAID') {
    title = 'Đang chờ chủ đồ giao đồ chơi'
    text =
      'Tiền thuê và tiền cọc đang được ToyFlow giữ. Chủ đồ sẽ giao đồ chơi kèm ảnh tình trạng; bạn kiểm tra và xác nhận khi nhận được.'
  } else if (order.status === 'SHIPPING') {
    title = isOwner ? 'Đang chờ người thuê xác nhận' : 'Đang chờ hệ thống tự xác nhận'
    text = isOwner
      ? order.timer && remaining
        ? `Người thuê kiểm tra và xác nhận trước ${formatDateTime(order.timer.dueAt)} (${remaining}). Quá hạn, hệ thống tự xác nhận và bắt đầu tính thời gian thuê.`
        : 'Đã quá hạn xác nhận, hệ thống sẽ tự xác nhận và bắt đầu tính thời gian thuê.'
      : 'Đã quá hạn xác nhận nhận hàng, hệ thống sẽ tự chuyển đơn sang “Đang thuê”.'
  } else if (order.status === 'RETURNING') {
    const lateFee = order.returnInfo?.lateFee ?? 0
    const deadline = order.timer && remaining ? `trước ${formatDateTime(order.timer.dueAt)} (${remaining})` : 'trong thời hạn kiểm tra'
    title = 'Đang chờ chủ đồ kiểm tra'
    text = `Chủ đồ kiểm tra tình trạng ${deadline}. Nếu đồ còn tốt, bạn được hoàn ${formatVnd(order.pricing.depositAmount - lateFee)} tiền cọc${lateFee > 0 ? ` (đã trừ ${formatVnd(lateFee)} phí trả trễ)` : ''}.`
  } else if (order.status === 'COMPLETED') {
    const refund = order.pricing.depositAmount - (order.returnInfo?.lateFee ?? 0)
    title = 'Đơn thuê đã hoàn tất'
    text = isOwner
      ? 'Tiền thuê sau phí nền tảng (cộng phí trả trễ nếu có) đã vào ví của bạn. Xem chi tiết ở mục Quyết toán.'
      : `${formatVnd(refund)} tiền cọc đã được hoàn vào ví của bạn. Cảm ơn bạn đã giữ gìn đồ chơi.`
  } else if (order.status === 'DISPUTING') {
    title = isOwner ? 'Đã mở khiếu nại hư hỏng' : 'Chủ đồ báo đồ chơi bị hư hỏng'
    text = isOwner
      ? 'Quản trị viên ToyFlow sẽ xem ảnh lúc giao, lúc trả và ảnh bằng chứng của bạn rồi quyết định phần tiền cọc.'
      : 'Tiền cọc đang được giữ trong lúc quản trị viên ToyFlow xem xét. Ảnh bạn chụp lúc nhận và lúc trả là căn cứ bảo vệ bạn.'
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
  const isRenter = Boolean(order && profile.data && order.renterId === profile.data.id)
  // Breadcrumb quay về đúng danh sách của vai trò người xem
  const backTo = isRenter
    ? { to: PATHS.myRentals, label: 'Đơn thuê của tôi' }
    : { to: PATHS.rentalRequests, label: 'Yêu cầu thuê nhận được' }

  useEffect(() => {
    document.title = `${order ? `Đơn thuê ${order.code}` : 'Đơn thuê'} | ToyFlow`
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
          <Link to={backTo.to}>{backTo.label}</Link>
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
            <Link to={backTo.to} className="rental-btn rental-btn--ghost">
              <ArrowLeft aria-hidden /> Về {backTo.label.toLowerCase()}
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
              <DecisionPanel order={order} isOwner={isOwner} isRenter={isRenter} now={now} />
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

              <RentalHandoverRecord order={order} />
              <RentalReturnRecord order={order} isOwner={isOwner} />
              <RentalSettlementRecord order={order} isOwner={isOwner} />

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
                {isOwner && !order.settlement && (
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
                {isOwner && !order.settlement && (
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
