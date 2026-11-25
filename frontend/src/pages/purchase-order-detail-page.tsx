import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Clock, Home, MapPin, Truck } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'

import { PurchaseProgress } from '../features/purchases/components/purchase-progress'
import { ReceiveOrderPanel } from '../features/purchases/components/receive-order-panel'
import { ShipOrderForm } from '../features/purchases/components/ship-order-form'
import type { PurchaseOrder, PurchaseRole } from '../features/purchases/purchase-api'
import {
  DELIVERY_METHOD_LABELS,
  PURCHASE_STATUS_LABELS,
  PURCHASE_STATUS_TONES,
  formatAddress,
} from '../features/purchases/purchase-display'
import { purchaseDetailQuery } from '../features/purchases/purchase-queries'
import { formatDateTime } from '../features/rentals/rental-display'
import { formatVnd } from '../features/toy-listings/format-vnd'
import { AccountLayout } from '../layouts/account/account-layout'
import { PATHS, toyDetailPath } from '../routes/paths'
import { ApiError, getErrorMessage } from '../services/api-error'
import { getStoredUser } from '../services/token-storage'

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-tf-surface bg-white p-5">
      <h2 className="text-sm font-bold tracking-wide text-tf-ink-muted uppercase">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function Row({ label, value, strong = false }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <dt className="text-tf-ink-muted">{label}</dt>
      <dd className={`text-right tabular-nums ${strong ? 'text-base font-bold text-tf-primary' : 'font-semibold text-tf-ink'}`}>
        {value}
      </dd>
    </div>
  )
}

/** Hạn của đơn (giữ từ lúc tạo, GB-38); đơn tạo trước khi có Cấu hình hệ thống dùng 48 giờ / 7 ngày */
const policyOf = (order: PurchaseOrder) => ({
  shipDeadlineHours: order.policy?.shipDeadlineHours ?? 48,
  autoCompleteDays: order.policy?.autoCompleteDays ?? 7,
})

/** 0.05 → "5%": tỉ lệ hoa hồng lưu trên đơn, hoặc tính lại từ số tiền với đơn cũ */
const commissionPercent = ({ platformFeeRate, platformFee, itemPrice }: PurchaseOrder['pricing']) => {
  const rate = platformFeeRate ?? (itemPrice > 0 ? platformFee / itemPrice : 0)
  return `${(Math.round(rate * 10_000) / 100).toLocaleString('vi-VN')}%`
}

/** Người mua thấy số đã trả; người bán thấy số sẽ nhận: giá món + phí giao (để tự gửi hàng) − hoa hồng */
function MoneyCard({ order, role }: { order: PurchaseOrder; role: PurchaseRole }) {
  const { pricing, settlement } = order
  return (
    <Card title="Thanh toán">
      <dl>
        <Row label="Giá món" value={formatVnd(pricing.itemPrice)} />
        {role === 'buyer' ? (
          <>
            <Row label="Phí giao hàng" value={pricing.shippingFee ? formatVnd(pricing.shippingFee) : 'Miễn phí'} />
            <Row
              label={order.status === 'CANCELLED' ? 'Đã hoàn vào ví' : 'Đã thanh toán (ký quỹ)'}
              value={formatVnd(pricing.totalPayable)}
              strong
            />
          </>
        ) : (
          <>
            {pricing.shippingFee > 0 && <Row label="Phí giao hàng" value={`+${formatVnd(pricing.shippingFee)}`} />}
            <Row label={`Hoa hồng ToyFlow (${commissionPercent(pricing)})`} value={`−${formatVnd(pricing.platformFee)}`} />
            <Row
              label={settlement ? 'Đã nhận vào ví' : 'Bạn sẽ nhận'}
              value={formatVnd(settlement?.sellerReceived ?? pricing.sellerNet)}
              strong
            />
          </>
        )}
      </dl>
      {settlement && <p className="mt-2 text-xs text-tf-ink-muted">Quyết toán lúc {formatDateTime(settlement.settledAt)}.</p>}
    </Card>
  )
}

/** Dòng trạng thái cho người không có việc phải làm ở bước này */
function WaitingNote({ order, role }: { order: PurchaseOrder; role: PurchaseRole }) {
  let text: string | undefined
  const dueAt = order.timer?.dueAt ? formatDateTime(order.timer.dueAt) : undefined
  if (order.status === 'PAID' && role === 'buyer') {
    text = dueAt
      ? `Đang chờ người bán gửi hàng (hạn ${dueAt}). Quá hạn, đơn tự huỷ và ToyFlow hoàn tiền vào ví của bạn.`
      : 'Đang chờ người bán gửi hàng.'
  } else if (order.status === 'SHIPPING' && role === 'seller') {
    text = `Đã gửi hàng. Tiền về ví khi người mua xác nhận đã nhận và hài lòng${dueAt ? `, hoặc tự động lúc ${dueAt} nếu người mua không xác nhận hay khiếu nại` : ''}.`
  } else if (order.status === 'COMPLETED') {
    const auto = order.settlement?.autoSettled
      ? `tự hoàn tất sau ${policyOf(order).autoCompleteDays} ngày kể từ khi gửi hàng`
      : 'đã hoàn tất'
    text = role === 'seller' ? `Đơn ${auto}, tiền đã vào ví của bạn.` : `Đơn ${auto}. Cảm ơn bạn đã mua trên ToyFlow!`
  } else if (order.status === 'CANCELLED') {
    text =
      role === 'seller'
        ? `Đơn đã tự huỷ vì quá ${policyOf(order).shipDeadlineHours} giờ chưa gửi hàng. Tiền đã hoàn cho người mua và tin được mở bán lại.`
        : `Đơn đã tự huỷ vì người bán không gửi hàng trong ${policyOf(order).shipDeadlineHours} giờ. ToyFlow đã hoàn toàn bộ tiền vào ví của bạn.`
  }
  if (!text) return null
  const walletLink = (order.status === 'COMPLETED' && role === 'seller') || (order.status === 'CANCELLED' && role === 'buyer')
  return (
    <p className="flex items-start gap-2 rounded-xl bg-tf-surface/60 px-4 py-3 text-sm text-tf-ink">
      <Clock className="mt-0.5 size-4 shrink-0 text-tf-primary" aria-hidden />
      <span>
        {text}
        {walletLink && (
          <>
            {' '}
            <Link to={PATHS.wallet} className="font-semibold text-tf-primary hover:underline">
              Xem ví
            </Link>
          </>
        )}
      </span>
    </p>
  )
}

/**
 * Chi tiết một đơn mua bán (UC12–13). Người bán thấy form gửi hàng khi đơn PAID; người mua thấy nút
 * "Đã nhận & hài lòng" khi đơn SHIPPING. Server vẫn kiểm tra quyền và trạng thái ở mỗi thao tác.
 */
export function PurchaseOrderDetailPage() {
  const { orderId = '' } = useParams()
  const detail = useQuery(purchaseDetailQuery(orderId))
  const order = detail.data
  const userId = getStoredUser()?.id
  const role: PurchaseRole | undefined = order ? (order.sellerId === userId ? 'seller' : 'buyer') : undefined

  useEffect(() => {
    document.title = order ? `Đơn ${order.code} | ToyFlow` : 'Đơn mua bán | ToyFlow'
  }, [order])

  const listPath = role === 'seller' ? PATHS.sales : PATHS.purchases
  const missing =
    detail.error instanceof ApiError && [400, 403, 404].includes(detail.error.status)

  return (
    <AccountLayout activeItem="purchases">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-xs text-tf-ink-muted">
        <Link to={PATHS.home} className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap hover:text-tf-primary">
          <Home className="size-3.5" aria-hidden /> Trang chủ
        </Link>
        <ChevronRight className="size-3.5 shrink-0" aria-hidden />
        <Link to={listPath} className="shrink-0 whitespace-nowrap hover:text-tf-primary">
          {role === 'seller' ? 'Đơn bán' : 'Đơn mua'}
        </Link>
        <ChevronRight className="size-3.5 shrink-0" aria-hidden />
        <span aria-current="page" className="min-w-0 truncate font-medium text-tf-ink">
          {order?.code ?? 'Chi tiết đơn'}
        </span>
      </nav>

      {detail.isPending && <div aria-hidden className="mt-6 h-96 animate-pulse rounded-2xl bg-tf-surface" />}

      {detail.isError && (
        <div role="alert" className="mt-6 rounded-2xl border border-dashed border-tf-outline bg-white px-6 py-10 text-center">
          <p className="font-semibold text-tf-ink">{missing ? 'Không tìm thấy đơn hàng.' : 'Chưa tải được đơn hàng.'}</p>
          {!missing && <p className="mt-1 text-sm text-tf-ink-muted">{getErrorMessage(detail.error)}</p>}
          {missing ? (
            <Link to={PATHS.purchases} className="mt-3 inline-block text-sm font-semibold text-tf-primary hover:underline">
              Về danh sách đơn
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => void detail.refetch()}
              className="mt-3 inline-flex h-9 items-center rounded-full border border-tf-surface px-4 text-sm font-semibold text-tf-primary hover:border-tf-primary"
            >
              Thử lại
            </button>
          )}
        </div>
      )}

      {order && role && (
        <div className="mt-4 flex flex-col gap-4">
          <header className="flex flex-col gap-3 rounded-2xl border border-tf-surface bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-bold text-tf-ink">
                {role === 'seller' ? 'Đơn bán' : 'Đơn mua'} {order.code}
              </h1>
              <p className="mt-0.5 text-sm text-tf-ink-muted">
                Đặt lúc {formatDateTime(order.createdAt)}
                {order.cancelledAt && ` · Huỷ lúc ${formatDateTime(order.cancelledAt)}`}
              </p>
            </div>
            <span className={`self-start rounded-full px-3 py-1 text-sm font-semibold sm:self-auto ${PURCHASE_STATUS_TONES[order.status]}`}>
              {PURCHASE_STATUS_LABELS[order.status]}
            </span>
          </header>

          <div className="rounded-2xl border border-tf-surface bg-white p-5">
            <PurchaseProgress order={order} />
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="flex flex-col gap-4">
              <WaitingNote order={order} role={role} />

              {role === 'seller' && order.status === 'PAID' && (
                <div className="rounded-2xl border border-tf-primary/30 bg-white p-5">
                  <ShipOrderForm order={order} />
                </div>
              )}
              {role === 'buyer' && order.status === 'SHIPPING' && (
                <div className="rounded-2xl border border-tf-primary/30 bg-white p-5">
                  <ReceiveOrderPanel order={order} />
                </div>
              )}

              <Card title="Món đồ chơi">
                <Link to={toyDetailPath(order.toyId)} className="group flex items-center gap-3">
                  <span className="size-16 shrink-0 overflow-hidden rounded-xl bg-tf-surface">
                    {order.itemDetails.image && <img src={order.itemDetails.image} alt="" className="size-full object-cover" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-tf-ink group-hover:text-tf-primary">{order.itemDetails.title}</span>
                    {order.itemDetails.condition && (
                      <span className="text-xs text-tf-ink-muted">Tình trạng: {order.itemDetails.condition}</span>
                    )}
                  </span>
                </Link>
              </Card>

              {order.shippingInfo && (
                <Card title="Thông tin gửi hàng">
                  <dl>
                    <Row label="Đơn vị" value={order.shippingInfo.carrierName} />
                    {order.shippingInfo.trackingCode && <Row label="Mã vận đơn" value={order.shippingInfo.trackingCode} />}
                    {order.shippingInfo.shippedAt && <Row label="Gửi lúc" value={formatDateTime(order.shippingInfo.shippedAt)} />}
                  </dl>
                  {order.shippingInfo.note && <p className="mt-2 text-sm text-tf-ink">“{order.shippingInfo.note}”</p>}
                  {order.shippingInfo.photos && order.shippingInfo.photos.length > 0 && (
                    <ul aria-label="Ảnh đóng gói" className="mt-3 flex flex-wrap gap-2">
                      {order.shippingInfo.photos.map((photo, index) => (
                        <li key={photo.url}>
                          <a href={photo.url} target="_blank" rel="noreferrer" className="block size-20 overflow-hidden rounded-lg border border-tf-surface">
                            <img src={photo.url} alt={`Ảnh đóng gói ${index + 1}`} className="size-full object-cover" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              )}
            </div>

            <div className="flex flex-col gap-4">
              <MoneyCard order={order} role={role} />
              <Card title="Nhận hàng">
                <p className="flex items-center gap-2 text-sm font-semibold text-tf-ink">
                  {order.deliveryMethod === 'DELIVERY' ? (
                    <Truck className="size-4 text-tf-primary" aria-hidden />
                  ) : (
                    <MapPin className="size-4 text-tf-primary" aria-hidden />
                  )}
                  {DELIVERY_METHOD_LABELS[order.deliveryMethod]}
                </p>
                {order.deliveryMethod === 'DELIVERY' && order.deliveryInfo && (
                  <div className="mt-2 text-sm text-tf-ink">
                    <p className="font-semibold">
                      {order.deliveryInfo.recipientName} · {order.deliveryInfo.recipientPhone}
                    </p>
                    <p className="text-tf-ink-muted">{formatAddress(order.deliveryInfo)}</p>
                  </div>
                )}
                {order.deliveryInfo?.notes && (
                  <p className="mt-2 text-sm text-tf-ink-muted">Ghi chú: {order.deliveryInfo.notes}</p>
                )}
              </Card>
            </div>
          </div>
        </div>
      )}
    </AccountLayout>
  )
}
