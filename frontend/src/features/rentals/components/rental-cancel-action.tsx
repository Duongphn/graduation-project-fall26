import { Ban, CalendarX2, Lock } from 'lucide-react'
import { useState } from 'react'
import { ReasonModal } from '../../../components/common'
import { formatVnd } from '../../toy-listings/format-vnd'
import { useRentalCancel, type RentalOrder, type RentalRole } from '../rental-orders-api'
import { CANCEL_REASON_PRESETS, formatFullDate, previewCancel } from '../rental-display'

interface RentalCancelActionProps {
  order: RentalOrder
  role: RentalRole
  now: number
}

/**
 * Huỷ đơn thuê (UC14) ở cuối cột bên: một nút phụ kèm một dòng nói trước hệ quả về tiền. Từ lúc chủ đồ giao
 * đồ trở đi chỉ còn dòng giải thích không huỷ được. Hộp lý do cho xem phí huỷ và tiền hoàn trước khi gửi.
 */
export function RentalCancelAction({ order, role, now }: RentalCancelActionProps) {
  const [open, setOpen] = useState(false)
  const cancel = useRentalCancel(order.id, order.toyId, () => setOpen(false))
  const preview = previewCancel(order, role, now)
  const isRenter = role === 'renter'

  if (!preview.allowed) {
    if (preview.reason !== 'shipped') return null
    return (
      <p className="rental-cancel rental-cancel--locked">
        <Lock aria-hidden />
        Đồ chơi đã được giao nên đơn không huỷ được nữa. Nếu có vấn đề với đồ chơi, hãy liên hệ ToyFlow để mở
        khiếu nại.
      </p>
    )
  }

  const consequence = !preview.paid
    ? 'Chưa thanh toán nên huỷ không mất phí.'
    : !isRenter
      ? `Người thuê được hoàn đủ ${formatVnd(preview.refund)}.`
      : preview.feeWaived
        ? `Chủ đồ chưa giao đúng ngày nhận nên bạn được hoàn đủ ${formatVnd(preview.refund)}.`
        : `Huỷ bây giờ mất phí khoảng ${formatVnd(preview.fee)}, hoàn ${formatVnd(preview.refund)} về ví.`

  return (
    <div className="rental-cancel">
      <button type="button" className="rental-cancel__trigger" onClick={() => setOpen(true)}>
        <Ban aria-hidden /> Huỷ đơn thuê
      </button>
      <p className="rental-cancel__hint">{consequence}</p>

      <ReasonModal
        open={open}
        title={`Huỷ đơn thuê ${order.code}?`}
        okText="Huỷ đơn"
        cancelText="Giữ đơn"
        label={isRenter ? 'Lý do huỷ (chủ đồ sẽ thấy)' : 'Lý do huỷ (người thuê sẽ thấy)'}
        presets={CANCEL_REASON_PRESETS[role]}
        loading={cancel.isPending}
        onCancel={() => setOpen(false)}
        onSubmit={(reason) => cancel.mutate(reason)}
      >
        <div className="rental-cancel__summary">
          {preview.paid ? (
            <dl className="rental-money">
              <div>
                <dt>Người thuê đã thanh toán</dt>
                <dd>{formatVnd(order.pricing.totalPayable)}</dd>
              </div>
              <div>
                <dt>
                  {preview.fee > 0
                    ? 'Phí huỷ (tạm tính theo tiền thuê, cộng cho chủ đồ)'
                    : preview.feeWaived
                      ? 'Phí huỷ (miễn vì chưa được giao đúng hẹn)'
                      : 'Phí huỷ'}
                </dt>
                <dd className={preview.fee > 0 ? 'is-fee' : undefined}>
                  {preview.fee > 0 ? `−${formatVnd(preview.fee)}` : formatVnd(0)}
                </dd>
              </div>
              <div className="rental-money__total">
                <dt>Hoàn về ví người thuê</dt>
                <dd>{formatVnd(preview.refund)}</dd>
              </div>
            </dl>
          ) : (
            <p>Đơn chưa được thanh toán nên không có tiền nào phải hoàn.</p>
          )}
          <p className="rental-cancel__calendar">
            <CalendarX2 aria-hidden />
            Lịch từ {formatFullDate(order.period.startDate)} đến {formatFullDate(order.period.endDate)} được mở lại cho
            người khác đặt. Không hoàn tác được sau khi huỷ.
          </p>
        </div>
      </ReasonModal>
    </div>
  )
}
