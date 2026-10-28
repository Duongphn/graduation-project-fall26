import { useQuery } from '@tanstack/react-query'
import { App } from 'antd'
import { Clock, RefreshCw, ShieldCheck, Wallet } from 'lucide-react'
import { useState } from 'react'
import { formatVnd } from '../../toy-listings/format-vnd'
import { myWalletQuery, useRentalPayment, type InsufficientBalance, type RentalOrderDetail } from '../rental-orders-api'
import { formatDateTime } from '../rental-display'

interface RentalPayPanelProps {
  order: RentalOrderDetail
  /** "còn 5 giờ 12 phút" tới hạn thanh toán */
  remaining: string
}

/**
 * Người thuê trả tiền thuê + cọc bằng ví ToyFlow vào ký quỹ (UC08).
 * So số dư với số cần trả ngay trên khung; thiếu tiền thì chỉ rõ còn thiếu bao nhiêu và cách nạp.
 */
export function RentalPayPanel({ order, remaining }: RentalPayPanelProps) {
  const { modal } = App.useApp()
  const wallet = useQuery(myWalletQuery)
  // Số thiếu do server báo khi bấm thanh toán (số dư có thể đổi sau lần tải ví gần nhất)
  const [serverShortfall, setServerShortfall] = useState<InsufficientBalance | null>(null)
  const pay = useRentalPayment(order.id, setServerShortfall)

  const total = order.pricing.totalPayable
  const balance = serverShortfall?.balance ?? wallet.data?.balance
  const shortfall = serverShortfall?.shortfall ?? (balance !== undefined ? Math.max(0, total - balance) : 0)
  const enough = balance !== undefined && shortfall === 0

  const confirmPay = () => {
    modal.confirm({
      title: `Thanh toán ${formatVnd(total)} từ ví ToyFlow?`,
      content:
        'Tiền thuê và tiền cọc được chuyển vào ví ký quỹ. Chủ đồ chỉ nhận tiền thuê sau khi bạn trả đồ; tiền cọc được hoàn lại nếu đồ chơi còn tốt.',
      okText: 'Thanh toán',
      cancelText: 'Để sau',
      onOk: () => {
        setServerShortfall(null)
        pay.mutate()
      },
    })
  }

  return (
    <section className="rental-pay" aria-labelledby="pay-title">
      <p className="rental-decision__due">
        <Clock aria-hidden />
        Hạn thanh toán {order.timer ? formatDateTime(order.timer.dueAt) : ''} · <strong>{remaining}</strong>
      </p>
      <h2 id="pay-title" className="rental-decision__title">
        Chủ đồ đã chấp nhận. Thanh toán để giữ lịch thuê
      </h2>

      <dl className="rental-pay__ledger" aria-busy={wallet.isFetching}>
        <div>
          <dt>
            <Wallet aria-hidden /> Số dư ví
          </dt>
          <dd>
            {wallet.isError && !serverShortfall ? (
              <button type="button" className="rental-pay__retry" onClick={() => void wallet.refetch()}>
                Không tải được, thử lại
              </button>
            ) : balance === undefined ? (
              <span className="rental-skeleton-text rental-pay__skeleton" aria-hidden="true" />
            ) : (
              formatVnd(balance)
            )}
          </dd>
        </div>
        <div>
          <dt>Cần thanh toán (tiền thuê + cọc)</dt>
          <dd>−{formatVnd(total)}</dd>
        </div>
        <div className={`rental-pay__result ${enough ? 'is-ok' : balance !== undefined ? 'is-short' : ''}`}>
          <dt>{enough || balance === undefined ? 'Số dư sau thanh toán' : 'Ví còn thiếu'}</dt>
          <dd>{balance === undefined ? '—' : enough ? formatVnd(balance - total) : formatVnd(shortfall)}</dd>
        </div>
      </dl>

      {balance !== undefined && !enough && (
        <div className="rental-pay__topup" role="alert">
          <p>
            Nạp thêm ít nhất <strong>{formatVnd(shortfall)}</strong> vào ví ToyFlow rồi quay lại thanh toán trước hạn.
          </p>
          <p className="rental-pay__topup-note">
            Nạp ví trực tuyến chưa được mở; hiện quản trị viên ToyFlow nạp tiền vào ví giúp bạn.
          </p>
          <button
            type="button"
            className="rental-btn rental-btn--ghost"
            disabled={wallet.isFetching}
            onClick={() => {
              setServerShortfall(null)
              void wallet.refetch()
            }}
          >
            <RefreshCw aria-hidden /> {wallet.isFetching ? 'Đang kiểm tra…' : 'Kiểm tra lại số dư'}
          </button>
        </div>
      )}

      <button
        type="button"
        className="rental-btn rental-btn--primary rental-pay__submit"
        disabled={!enough || pay.isPending}
        onClick={confirmPay}
      >
        {pay.isPending ? 'Đang thanh toán…' : `Thanh toán ${formatVnd(total)}`}
      </button>

      <p className="rental-pay__escrow">
        <ShieldCheck aria-hidden />
        Tiền được giữ trong ví ký quỹ ToyFlow, không chuyển thẳng cho chủ đồ. Quá hạn chưa thanh toán, đơn tự huỷ và lịch
        được mở lại.
      </p>
    </section>
  )
}
