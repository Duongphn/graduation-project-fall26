import { App, Input } from 'antd'
import { BadgeCheck, Clock, PackageX, Scale, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useId, useState } from 'react'
import { ImageGallery } from '../../../components/common'
import { formatVnd } from '../../toy-listings/format-vnd'
import { useListingPhotos } from '../../toy-listings/hooks/use-listing-photos'
import type { ToyImage } from '../../toy-listings/toy-listing-api'
import {
  DAMAGE_DESCRIPTION_MAX,
  DAMAGE_DESCRIPTION_MIN,
  useRentalSettle,
  type RentalOrderDetail,
  type SettlementResult,
} from '../rental-orders-api'
import { formatDateTime } from '../rental-display'
import { RentalPhotoPicker } from './rental-photo-picker'

const NO_PHOTOS: ToyImage[] = []

/** Tiền ký quỹ chia khi đồ còn tốt, theo bút toán của server: chủ đồ R − F + L, người thuê D − L */
const goodSplit = (order: RentalOrderDetail) => {
  const { rentalFee, platformFee, depositAmount } = order.pricing
  const lateFee = order.returnInfo?.lateFee ?? 0
  return { lateFee, ownerGets: rentalFee - platformFee + lateFee, renterRefund: depositAmount - lateFee }
}

/** Bảng chia tiền khi quyết toán Tốt: phần của chủ đồ và phần cọc hoàn cho người thuê */
function GoodSplit({ order, isOwner }: { order: RentalOrderDetail; isOwner: boolean }) {
  const { lateFee, ownerGets, renterRefund } = goodSplit(order)
  const { rentalFee, platformFee, platformFeeRate } = order.pricing
  return (
    <dl className="rental-money rental-settle__split">
      <div>
        <dt>Tiền thuê</dt>
        <dd>{formatVnd(rentalFee)}</dd>
      </div>
      <div>
        <dt>Phí nền tảng {Math.round(platformFeeRate * 1000) / 10}%</dt>
        <dd>−{formatVnd(platformFee)}</dd>
      </div>
      {lateFee > 0 && (
        <div>
          <dt>Phí trả trễ (trừ từ cọc)</dt>
          <dd>+{formatVnd(lateFee)}</dd>
        </div>
      )}
      <div className="rental-money__total">
        <dt>{isOwner ? 'Bạn nhận' : 'Chủ đồ nhận'}</dt>
        <dd>{formatVnd(ownerGets)}</dd>
      </div>
      <div className="rental-settle__refund">
        <dt>{isOwner ? 'Hoàn cọc cho người thuê' : 'Cọc hoàn lại cho bạn'}</dt>
        <dd>{formatVnd(renterRefund)}</dd>
      </div>
    </dl>
  )
}

const CHOICES: { value: SettlementResult; title: string; hint: string; icon: typeof BadgeCheck }[] = [
  { value: 'GOOD', title: 'Còn tốt', hint: 'Như lúc giao, đủ phụ kiện', icon: BadgeCheck },
  { value: 'DAMAGED', title: 'Có hư hỏng', hint: 'Giữ cọc, mở khiếu nại', icon: PackageX },
]

/**
 * Chủ đồ nhận lại và quyết toán (UC11): Còn tốt → tiền thuê (trừ phí) vào ví chủ đồ, cọc (trừ phí trễ)
 * hoàn cho người thuê, Hoàn tất; Có hư hỏng → ảnh bằng chứng + mô tả, cọc giữ nguyên, Đang khiếu nại.
 * Quá hạn kiểm tra thì server không nhận báo hư hỏng nữa, chỉ còn xác nhận Tốt.
 */
export function RentalSettlePanel({ order, remaining }: { order: RentalOrderDetail; remaining: string | null }) {
  const { modal } = App.useApp()
  const descriptionId = useId()
  const canReportDamage = Boolean(remaining)
  const [choice, setChoice] = useState<SettlementResult>('GOOD')
  const photos = useListingPhotos(NO_PHOTOS)
  const [description, setDescription] = useState('')
  const [touched, setTouched] = useState(false)
  const settle = useRentalSettle(order.id)
  const damaged = choice === 'DAMAGED' && canReportDamage
  const { ownerGets, renterRefund } = goodSplit(order)
  const descriptionLength = description.trim().length
  const descriptionError =
    touched && descriptionLength < DAMAGE_DESCRIPTION_MIN
      ? `Mô tả rõ hư hỏng, ít nhất ${DAMAGE_DESCRIPTION_MIN} ký tự.`
      : null

  const confirm = () => {
    if (!damaged) {
      modal.confirm({
        title: 'Xác nhận đồ chơi còn tốt?',
        content: `${formatVnd(ownerGets)} vào ví của bạn, ${formatVnd(renterRefund)} tiền cọc hoàn cho người thuê và đơn hoàn tất. Không thể báo hư hỏng sau bước này.`,
        okText: 'Quyết toán',
        cancelText: 'Xem lại',
        onOk: () => settle.mutateAsync({ result: 'GOOD' }).catch(() => undefined),
      })
      return
    }
    setTouched(true)
    const files = photos.newFiles
    if (files.length === 0 || descriptionLength < DAMAGE_DESCRIPTION_MIN) return
    modal.confirm({
      title: 'Báo hư hỏng và mở khiếu nại?',
      content: `Tiền thuê và tiền cọc tiếp tục được ToyFlow giữ cho đến khi khiếu nại được giải quyết. ${files.length} ảnh bằng chứng và mô tả của bạn được gửi cho người thuê và quản trị viên.`,
      okText: 'Mở khiếu nại',
      okButtonProps: { danger: true },
      cancelText: 'Xem lại',
      onOk: () => settle.mutateAsync({ result: 'DAMAGED', photos: files, description }).catch(() => undefined),
    })
  }

  return (
    <section className={`rental-handover ${damaged ? 'rental-settle--damaged' : ''}`} aria-labelledby="settle-title">
      {order.timer && (
        <p className="rental-decision__due">
          <Clock aria-hidden />
          {remaining ? (
            <>
              Hạn kiểm tra {formatDateTime(order.timer.dueAt)} · <strong>{remaining}</strong>
            </>
          ) : (
            'Đã hết hạn kiểm tra, đơn sẽ được quyết toán là đồ còn tốt'
          )}
        </p>
      )}

      <h2 id="settle-title" className="rental-decision__title">
        Đồ chơi trả về có còn tốt?
      </h2>
      <p className="rental-decision__text">
        Đối chiếu đồ chơi với ảnh lúc giao và ảnh người thuê chụp lúc trả, kiểm tra cả phụ kiện kèm theo.
      </p>

      {canReportDamage && (
        <fieldset className="rental-settle__choices" disabled={settle.isPending}>
          <legend className="sr-only">Tình trạng đồ chơi khi nhận lại</legend>
          {CHOICES.map(({ value, title, hint, icon: Icon }) => (
            <label key={value} className={`rental-settle__choice rental-settle__choice--${value.toLowerCase()}`}>
              <input
                type="radio"
                name={`settle-${order.id}`}
                value={value}
                checked={choice === value}
                onChange={() => setChoice(value)}
              />
              <Icon aria-hidden />
              <span>
                <strong>{title}</strong>
                <small>{hint}</small>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {damaged ? (
        <>
          <RentalPhotoPicker
            label="Ảnh bằng chứng hư hỏng"
            photos={photos.photos}
            rejections={photos.rejections}
            missing={touched && photos.photos.length === 0}
            disabled={settle.isPending}
            onAddFiles={photos.addFiles}
            onRemove={photos.removePhoto}
          />
          <div className="rental-return__note">
            <label htmlFor={descriptionId}>Mô tả hư hỏng</label>
            <Input.TextArea
              id={descriptionId}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              onBlur={() => setTouched(true)}
              maxLength={DAMAGE_DESCRIPTION_MAX}
              showCount
              autoSize={{ minRows: 3, maxRows: 6 }}
              status={descriptionError ? 'error' : undefined}
              aria-invalid={Boolean(descriptionError)}
              aria-describedby={descriptionError ? `${descriptionId}-error` : undefined}
              disabled={settle.isPending}
              placeholder="VD: Gãy càng trước bên trái, mất 1 bánh xe dự phòng so với ảnh lúc giao."
            />
            {descriptionError && (
              <p id={`${descriptionId}-error`} className="rental-photos__errors">
                {descriptionError}
              </p>
            )}
          </div>
        </>
      ) : (
        <GoodSplit order={order} isOwner />
      )}

      <button
        type="button"
        className={`rental-btn rental-handover__submit ${damaged ? 'rental-btn--danger' : 'rental-btn--primary'}`}
        disabled={settle.isPending}
        onClick={confirm}
      >
        {damaged ? <ShieldAlert aria-hidden /> : <BadgeCheck aria-hidden />}
        {settle.isPending ? 'Đang gửi…' : damaged ? 'Báo hư hỏng và mở khiếu nại' : 'Xác nhận còn tốt, quyết toán'}
      </button>

      <p className="rental-pay__escrow">
        <ShieldCheck aria-hidden />
        {damaged
          ? 'Cọc được giữ nguyên trong ví ký quỹ. Quản trị viên xem ảnh của cả hai bên trước khi quyết định.'
          : 'Tiền được chuyển ngay từ ví ký quỹ ToyFlow khi bạn xác nhận.'}
      </p>
    </section>
  )
}

/** Kết quả quyết toán ở cột chính: Tốt → bảng chia tiền; Hư hỏng → ảnh bằng chứng + mô tả của chủ đồ */
export function RentalSettlementRecord({ order, isOwner }: { order: RentalOrderDetail; isOwner: boolean }) {
  const settlement = order.settlement
  if (!settlement) return null
  const good = settlement.result === 'GOOD'

  return (
    <section className="rental-block" aria-labelledby="settlement-title">
      <h2 id="settlement-title" className="rental-section-title">
        Quyết toán
      </h2>
      <p className={`rental-settle__verdict ${good ? 'is-good' : 'is-damaged'}`}>
        {good ? <BadgeCheck aria-hidden /> : <Scale aria-hidden />}
        <span>
          <strong>{good ? 'Đồ chơi còn tốt' : 'Chủ đồ báo hư hỏng, đang khiếu nại'}</strong>
          <time dateTime={settlement.settledAt}>
            {formatDateTime(settlement.settledAt)}
            {settlement.autoSettled && ' · hệ thống tự quyết toán vì hết hạn kiểm tra'}
          </time>
        </span>
      </p>

      {good ? (
        <div className="rental-settle__record-split">
          <GoodSplit order={order} isOwner={isOwner} />
        </div>
      ) : (
        <div className="rental-handover-record__side">
          {settlement.evidencePhotos && settlement.evidencePhotos.length > 0 && (
            <ImageGallery
              images={settlement.evidencePhotos.map((photo) => ({ url: photo.url, key: photo.publicId }))}
              size={72}
            />
          )}
          {settlement.description && (
            <blockquote className="rental-return-record__note">{settlement.description}</blockquote>
          )}
          <p className="rental-block__note">
            Tiền thuê và tiền cọc ({formatVnd(order.pricing.depositAmount)}) được ToyFlow giữ cho đến khi quản trị
            viên giải quyết khiếu nại.
          </p>
        </div>
      )}
    </section>
  )
}
