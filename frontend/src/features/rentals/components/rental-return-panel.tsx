import { App, Input } from 'antd'
import { AlarmClock, CalendarClock, PackageCheck, ShieldCheck, Undo2 } from 'lucide-react'
import { useId, useState } from 'react'
import { ImageGallery } from '../../../components/common'
import { formatVnd } from '../../toy-listings/format-vnd'
import { useListingPhotos } from '../../toy-listings/hooks/use-listing-photos'
import type { ToyImage } from '../../toy-listings/toy-listing-api'
import { RETURN_NOTE_MAX, useRentalReturn, type RentalOrderDetail } from '../rental-orders-api'
import { describeReturnDue, estimateLateFee, formatDateTime, formatFullDate } from '../rental-display'
import { RentalPhotoPicker } from './rental-photo-picker'

const NO_PHOTOS: ToyImage[] = []

/** Tiền cọc → phí trả trễ trừ vào cọc → phần cọc hoàn lại; dùng cho cả bản tạm tính lẫn bản server đã chốt */
function DepositBreakdown({
  deposit,
  lateDays,
  lateFee,
  dailyRate,
  refundLabel,
}: {
  deposit: number
  lateDays: number
  lateFee: number
  dailyRate: number
  refundLabel: string
}) {
  return (
    <dl className="rental-money rental-return__deposit">
      <div>
        <dt>Tiền cọc đang giữ</dt>
        <dd>{formatVnd(deposit)}</dd>
      </div>
      <div className={lateFee > 0 ? 'rental-return__fee' : undefined}>
        <dt>
          {lateDays > 0 ? `Phí trả trễ ${lateDays} ngày` : 'Phí trả trễ'}
          {lateDays > 0 && (
            <small className="rental-return__formula">
              {lateFee === deposit ? 'Đã chạm mức tối đa bằng tiền cọc' : `${formatVnd(dailyRate)} × ${lateDays} ngày`}
            </small>
          )}
        </dt>
        <dd>{lateFee > 0 ? `−${formatVnd(lateFee)}` : formatVnd(0)}</dd>
      </div>
      <div className="rental-money__total">
        <dt>{refundLabel}</dt>
        <dd>{formatVnd(deposit - lateFee)}</dd>
      </div>
    </dl>
  )
}

/**
 * Gửi trả đồ chơi (UC10), cho người thuê khi đơn đang thuê: nhắc hạn trả (đỏ khi đã quá hạn), tạm tính phí
 * trả trễ trừ vào cọc, chụp ảnh tình trạng lúc trả + ghi chú cho chủ đồ → Đang trả đồ.
 */
export function RentalReturnPanel({ order, now }: { order: RentalOrderDetail; now: number }) {
  const { modal } = App.useApp()
  const noteId = useId()
  const photos = useListingPhotos(NO_PHOTOS)
  const [note, setNote] = useState('')
  const [missing, setMissing] = useState(false)
  const returning = useRentalReturn(order.id)
  const due = describeReturnDue(order.period.endDate, now)
  const { lateDays, lateFee } = estimateLateFee(order, now)
  const { depositAmount, dailyRate } = order.pricing

  const confirm = () => {
    const files = photos.newFiles
    if (files.length === 0) {
      setMissing(true)
      return
    }
    modal.confirm({
      title: 'Gửi yêu cầu trả đồ chơi?',
      content:
        lateFee > 0
          ? `Bạn trả trễ ${lateDays} ngày: phí khoảng ${formatVnd(lateFee)} được trừ vào tiền cọc, hệ thống chốt con số khi nhận yêu cầu. ${files.length} ảnh của bạn được lưu làm bằng chứng tình trạng lúc trả.`
          : `Bạn trả đúng hạn nên không mất phí trễ. ${files.length} ảnh của bạn được lưu làm bằng chứng tình trạng lúc trả; chủ đồ kiểm tra rồi quyết toán tiền cọc.`,
      okText: 'Gửi trả',
      cancelText: 'Xem lại',
      // Giữ hộp thoại ở trạng thái chờ trong lúc tải ảnh; lỗi đã được useApiMutation báo
      onOk: () => returning.mutateAsync({ photos: files, note }).catch(() => undefined),
    })
  }

  return (
    <section className={`rental-handover ${due.late ? 'rental-return--late' : ''}`} aria-labelledby="return-panel-title">
      {due.late ? (
        <p className="rental-return__alert" role="status">
          <AlarmClock aria-hidden />
          <span>
            <strong>Đã quá hạn trả {lateDays} ngày.</strong> Phí trễ đang tính thêm {formatVnd(dailyRate)} mỗi ngày
            và trừ vào tiền cọc, hãy gửi trả sớm nhất có thể.
          </span>
        </p>
      ) : (
        <p className="rental-decision__due">
          <CalendarClock aria-hidden />
          Hạn trả hết ngày {formatFullDate(order.period.endDate)} · <strong>{due.text}</strong>
        </p>
      )}

      <h2 id="return-panel-title" className="rental-decision__title">
        Trả đồ chơi cho chủ đồ
      </h2>
      <p className="rental-decision__text">
        Chụp đồ chơi từ các góc như lúc nhận, kèm phụ kiện, ngay trước khi gửi trả. Chủ đồ đối chiếu với ảnh lúc giao để
        quyết toán tiền cọc.
      </p>

      <DepositBreakdown
        deposit={depositAmount}
        lateDays={lateDays}
        lateFee={lateFee}
        dailyRate={dailyRate}
        refundLabel={lateFee > 0 ? 'Cọc hoàn lại (tạm tính)' : 'Cọc hoàn lại'}
      />

      <RentalPhotoPicker
        label="Ảnh tình trạng lúc trả"
        photos={photos.photos}
        rejections={photos.rejections}
        missing={missing && photos.photos.length === 0}
        disabled={returning.isPending}
        onAddFiles={(files) => {
          setMissing(false)
          photos.addFiles(files)
        }}
        onRemove={photos.removePhoto}
      />

      <div className="rental-return__note">
        <label htmlFor={noteId}>
          Ghi chú cho chủ đồ <span>(không bắt buộc)</span>
        </label>
        <Input.TextArea
          id={noteId}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={RETURN_NOTE_MAX}
          showCount
          autoSize={{ minRows: 2, maxRows: 5 }}
          disabled={returning.isPending}
          placeholder="VD: Gửi qua GHN, mã vận đơn 8312…; pin đã được tháo ra."
        />
      </div>

      <button
        type="button"
        className="rental-btn rental-btn--primary rental-handover__submit"
        disabled={returning.isPending}
        onClick={confirm}
      >
        <Undo2 aria-hidden />
        {returning.isPending ? 'Đang tải ảnh lên…' : 'Gửi yêu cầu trả đồ'}
      </button>

      <p className="rental-pay__escrow">
        <ShieldCheck aria-hidden />
        Phí trễ được tính đến lúc bạn gửi yêu cầu này. Nếu đồ còn tốt hoặc chủ đồ không báo hư hỏng trong thời hạn
        kiểm tra, phần cọc còn lại tự hoàn về ví của bạn.
      </p>
    </section>
  )
}

/** Hồ sơ trả đồ ở cột chính: ảnh lúc trả, ghi chú, mốc gửi và phí trễ server đã chốt trừ vào cọc */
export function RentalReturnRecord({ order, isOwner }: { order: RentalOrderDetail; isOwner: boolean }) {
  const info = order.returnInfo
  if (!info) return null

  return (
    <section className="rental-block" aria-labelledby="return-title">
      <h2 id="return-title" className="rental-section-title">
        Trả đồ
      </h2>
      <div className="rental-return-record">
        <div className="rental-handover-record__side">
          <p className="rental-handover-record__label">
            <PackageCheck aria-hidden /> Lúc trả · người thuê
          </p>
          <time className="rental-handover-record__time" dateTime={info.requestedAt}>
            {formatDateTime(info.requestedAt)}
            {info.lateDays > 0 ? (
              <span className="rental-term__due is-late"> · trễ {info.lateDays} ngày</span>
            ) : (
              <span className="rental-term__due"> · đúng hạn</span>
            )}
          </time>
          <ImageGallery images={info.photos.map((photo) => ({ url: photo.url, key: photo.publicId }))} size={72} />
          {info.note && <blockquote className="rental-return-record__note">{info.note}</blockquote>}
        </div>

        <DepositBreakdown
          deposit={order.pricing.depositAmount}
          lateDays={info.lateDays}
          lateFee={info.lateFee}
          dailyRate={order.pricing.dailyRate}
          refundLabel={isOwner ? 'Hoàn lại người thuê' : 'Hoàn lại cho bạn'}
        />
      </div>
      <p className="rental-block__note">
        Cọc được hoàn khi đồ chơi còn tốt; nếu có hư hỏng, chủ đồ mở khiếu nại để ToyFlow xem xét.
        {isOwner && info.lateFee > 0 && ` Phí trả trễ ${formatVnd(info.lateFee)} được cộng cho bạn khi quyết toán.`}
      </p>
    </section>
  )
}
