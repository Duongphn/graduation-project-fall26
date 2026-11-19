import { App, Input } from 'antd'
import { Clock, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useId, useState } from 'react'
import { useListingPhotos } from '../../toy-listings/hooks/use-listing-photos'
import type { ToyImage } from '../../toy-listings/toy-listing-api'
import {
  COMPLAINT_DESCRIPTION_MAX,
  COMPLAINT_DESCRIPTION_MIN,
  COMPLAINT_REASONS,
  useOpenRentalDispute,
  type ComplaintReason,
  type ComplaintRole,
  type RentalOrderDetail,
} from '../rental-orders-api'
import { COMPLAINT_REASON_META, formatDateTime, formatRemaining, renterComplaintDueAt } from '../rental-display'
import { RentalPhotoPicker } from './rental-photo-picker'

const NO_PHOTOS: ToyImage[] = []

const PLACEHOLDER: Record<ComplaintRole, string> = {
  renter: 'VD: Lúc mở hộp, bánh xe sau bên phải đã gãy, khác ảnh chủ đồ chụp lúc giao.',
  owner: 'VD: Gãy càng trước bên trái, mất 1 bánh xe dự phòng so với ảnh lúc giao.',
}

/**
 * Người thuê thấy đồ chơi có vấn đề khi nhận: gửi khiếu nại trong 24 giờ đầu. Thu gọn mặc định để không
 * lấn nút trả đồ; hết hạn thì ẩn hẳn.
 */
export function RentalComplaintPanel({ order, now }: { order: RentalOrderDetail; now: number }) {
  const [expanded, setExpanded] = useState(false)
  const dueAt = renterComplaintDueAt(order.rentalStartedAt)
  const remaining = dueAt ? formatRemaining(dueAt, now) : null
  if (!dueAt || !remaining) return null

  return (
    <section className="rental-handover rental-complaint" aria-labelledby="complaint-title">
      <p className="rental-decision__due">
        <Clock aria-hidden />
        Hạn khiếu nại {formatDateTime(dueAt)} · <strong>{remaining}</strong>
      </p>
      <h2 id="complaint-title" className="rental-decision__title">
        Đồ chơi có vấn đề khi nhận?
      </h2>
      <p className="rental-decision__text">
        Hư hỏng, thiếu chi tiết hay không đúng mô tả: gửi khiếu nại kèm ảnh trong 24 giờ sau khi nhận. Chủ đồ được
        báo để phản hồi, quản trị viên ToyFlow quyết định phần tiền.
      </p>
      {expanded ? (
        <RentalComplaintForm orderId={order.id} role="renter" />
      ) : (
        <button type="button" className="rental-btn rental-btn--ghost" onClick={() => setExpanded(true)}>
          <ShieldAlert aria-hidden /> Gửi khiếu nại
        </button>
      )}
    </section>
  )
}

/**
 * Nội dung một khiếu nại: lý do (theo vai người gửi), 1–10 ảnh bằng chứng và mô tả 10–1000 ký tự.
 * Bấm gửi thì hỏi lại một lần, vì sau khi gửi đơn bị khoá ở Đang khiếu nại và mỗi đơn chỉ có một khiếu nại.
 */
export function RentalComplaintForm({ orderId, role }: { orderId: string; role: ComplaintRole }) {
  const { modal } = App.useApp()
  const formId = useId()
  const reasons = COMPLAINT_REASONS[role]
  const [reason, setReason] = useState<ComplaintReason | null>(null)
  const [description, setDescription] = useState('')
  const [touched, setTouched] = useState(false)
  const photos = useListingPhotos(NO_PHOTOS)
  const open = useOpenRentalDispute(orderId)

  const descriptionLength = description.trim().length
  const reasonError = touched && !reason ? 'Vui lòng chọn lý do khiếu nại.' : null
  const descriptionError =
    touched && descriptionLength < COMPLAINT_DESCRIPTION_MIN
      ? `Mô tả rõ vấn đề, ít nhất ${COMPLAINT_DESCRIPTION_MIN} ký tự.`
      : null
  const counterpart = role === 'renter' ? 'chủ đồ' : 'người thuê'

  const submit = () => {
    setTouched(true)
    const files = photos.newFiles
    if (!reason || files.length === 0 || descriptionLength < COMPLAINT_DESCRIPTION_MIN) return
    modal.confirm({
      title: 'Gửi khiếu nại?',
      content: `Đơn chuyển sang Đang khiếu nại, tiền thuê và tiền cọc được ToyFlow giữ cho đến khi quản trị viên phán quyết. ${files.length} ảnh và mô tả của bạn được gửi cho ${counterpart} để phản hồi. Mỗi đơn chỉ gửi khiếu nại được một lần.`,
      okText: 'Gửi khiếu nại',
      okButtonProps: { danger: true },
      cancelText: 'Xem lại',
      onOk: () => open.mutateAsync({ reason, description, photos: files }).catch(() => undefined),
    })
  }

  return (
    <div className="rental-complaint__form">
      <fieldset
        className="rental-complaint__reasons"
        disabled={open.isPending}
        aria-invalid={Boolean(reasonError)}
        aria-describedby={reasonError ? `${formId}-reason-error` : undefined}
      >
        <legend className="rental-complaint__label">Lý do khiếu nại</legend>
        {reasons.map((value) => (
          <label key={value} className="rental-complaint__reason">
            <input
              type="radio"
              name={`${formId}-reason`}
              value={value}
              checked={reason === value}
              onChange={() => setReason(value)}
            />
            <span>
              <strong>{COMPLAINT_REASON_META[value].label}</strong>
              <small>{COMPLAINT_REASON_META[value].hint}</small>
            </span>
          </label>
        ))}
        {reasonError && (
          <p id={`${formId}-reason-error`} className="rental-photos__errors">
            {reasonError}
          </p>
        )}
      </fieldset>

      <RentalPhotoPicker
        label="Ảnh bằng chứng"
        photos={photos.photos}
        rejections={photos.rejections}
        missing={touched && photos.photos.length === 0}
        disabled={open.isPending}
        onAddFiles={photos.addFiles}
        onRemove={photos.removePhoto}
      />

      <div className="rental-return__note">
        <label htmlFor={`${formId}-description`}>Mô tả vấn đề</label>
        <Input.TextArea
          id={`${formId}-description`}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          onBlur={() => setTouched(true)}
          maxLength={COMPLAINT_DESCRIPTION_MAX}
          showCount
          autoSize={{ minRows: 3, maxRows: 6 }}
          status={descriptionError ? 'error' : undefined}
          aria-invalid={Boolean(descriptionError)}
          aria-describedby={descriptionError ? `${formId}-description-error` : undefined}
          disabled={open.isPending}
          placeholder={PLACEHOLDER[role]}
        />
        {descriptionError && (
          <p id={`${formId}-description-error`} className="rental-photos__errors">
            {descriptionError}
          </p>
        )}
      </div>

      <button
        type="button"
        className="rental-btn rental-btn--danger rental-handover__submit"
        disabled={open.isPending}
        onClick={submit}
      >
        <ShieldAlert aria-hidden />
        {open.isPending ? 'Đang gửi…' : 'Gửi khiếu nại'}
      </button>

      <p className="rental-pay__escrow">
        <ShieldCheck aria-hidden />
        Tiền thuê và tiền cọc nằm nguyên trong ví ký quỹ. Quản trị viên xem ảnh của cả hai bên trước khi quyết định.
      </p>
    </div>
  )
}
