import { App } from 'antd'
import { Clock, PackageCheck, ShieldCheck, Truck } from 'lucide-react'
import { useState } from 'react'
import { ImageGallery } from '../../../components/common'
import { useListingPhotos } from '../../toy-listings/hooks/use-listing-photos'
import type { ToyImage } from '../../toy-listings/toy-listing-api'
import { useRentalHandover, type HandoverStep, type RentalOrderDetail } from '../rental-orders-api'
import { formatDateTime, formatFullDate } from '../rental-display'
import { RentalPhotoPicker } from './rental-photo-picker'

const NO_PHOTOS: ToyImage[] = []

/** Hai mốc của bàn giao; mốc hiện tại được tô, mốc đã qua đánh dấu xong */
function HandoverSteps({ step }: { step: HandoverStep }) {
  return (
    <ol className="rental-handover__steps" aria-label="Các bước bàn giao">
      <li className={step === 'ship' ? 'is-current' : 'is-done'} aria-current={step === 'ship' ? 'step' : undefined}>
        <span aria-hidden="true">1</span> Chủ đồ giao
      </li>
      <li className={step === 'receive' ? 'is-current' : ''} aria-current={step === 'receive' ? 'step' : undefined}>
        <span aria-hidden="true">2</span> Người thuê nhận
      </li>
    </ol>
  )
}

interface RentalHandoverPanelProps {
  order: RentalOrderDetail
  /** ship: chủ đồ khi đơn PAID; receive: người thuê khi đơn SHIPPING còn hạn xác nhận */
  step: HandoverStep
  /** "còn 5 giờ 12 phút" tới lúc hệ thống tự xác nhận nhận hàng (chỉ bước receive) */
  remaining?: string | null
}

/**
 * Bàn giao đồ chơi (UC09): chủ đồ chụp ảnh tình trạng rồi xác nhận đã giao → Đang giao;
 * người thuê đối chiếu ảnh của chủ đồ, chụp lại lúc nhận rồi xác nhận → Đang thuê, bắt đầu tính giờ.
 */
export function RentalHandoverPanel({ order, step, remaining }: RentalHandoverPanelProps) {
  const { modal } = App.useApp()
  const photos = useListingPhotos(NO_PHOTOS)
  const [missing, setMissing] = useState(false)
  const handover = useRentalHandover(order.id, step)
  const isShip = step === 'ship'
  const ownerPhotos = order.handover?.ownerPhotos ?? []

  const confirm = () => {
    const files = photos.newFiles
    if (files.length === 0) {
      setMissing(true)
      return
    }
    modal.confirm({
      title: isShip ? 'Xác nhận đã giao đồ chơi?' : 'Xác nhận đã nhận đồ chơi?',
      content: isShip
        ? `Đơn chuyển sang “Đang giao” kèm ${files.length} ảnh tình trạng. Người thuê kiểm tra rồi xác nhận khi nhận được; ảnh không sửa được sau bước này.`
        : `Thời gian thuê bắt đầu tính ngay khi bạn xác nhận, hạn trả hết ngày ${formatFullDate(order.period.endDate)}. ${files.length} ảnh của bạn được lưu làm bằng chứng tình trạng lúc nhận.`,
      okText: isShip ? 'Đã giao' : 'Đã nhận',
      cancelText: 'Xem lại',
      // Giữ hộp thoại ở trạng thái chờ trong lúc tải ảnh; lỗi đã được useApiMutation báo
      onOk: () => handover.mutateAsync(files).catch(() => undefined),
    })
  }

  return (
    <section className="rental-handover" aria-labelledby="handover-panel-title">
      <HandoverSteps step={step} />

      {!isShip && remaining && order.timer && (
        <p className="rental-decision__due">
          <Clock aria-hidden />
          Tự xác nhận lúc {formatDateTime(order.timer.dueAt)} · <strong>{remaining}</strong>
        </p>
      )}

      <h2 id="handover-panel-title" className="rental-decision__title">
        {isShip ? 'Giao đồ chơi cho người thuê' : 'Bạn đã nhận được đồ chơi?'}
      </h2>

      {isShip ? (
        <p className="rental-decision__text">
          Người thuê đặt nhận ngày <strong>{formatFullDate(order.period.startDate)}</strong>. Trước khi gửi, chụp đồ chơi
          từ nhiều góc: toàn thân, chi tiết dễ hỏng, vết xước sẵn có và phụ kiện kèm theo. Ảnh là căn cứ tình trạng khi
          quyết toán tiền cọc.
        </p>
      ) : (
        <>
          {ownerPhotos.length > 0 && (
            <figure className="rental-handover__reference">
              <figcaption>
                Chủ đồ chụp lúc giao
                {order.handover?.shippedAt && <time dateTime={order.handover.shippedAt}> · {formatDateTime(order.handover.shippedAt)}</time>}
              </figcaption>
              <ImageGallery images={ownerPhotos.map((photo) => ({ url: photo.url, key: photo.publicId }))} size={60} />
            </figure>
          )}
          <p className="rental-decision__text">
            Đối chiếu đồ chơi với ảnh của chủ đồ, rồi chụp lại tình trạng lúc nhận. Nếu có hư hỏng, ảnh của bạn là bằng
            chứng bảo vệ tiền cọc.
          </p>
        </>
      )}

      <RentalPhotoPicker
        label={isShip ? 'Ảnh tình trạng lúc giao' : 'Ảnh tình trạng lúc nhận'}
        photos={photos.photos}
        rejections={photos.rejections}
        missing={missing && photos.photos.length === 0}
        disabled={handover.isPending}
        onAddFiles={(files) => {
          setMissing(false)
          photos.addFiles(files)
        }}
        onRemove={photos.removePhoto}
      />

      <button
        type="button"
        className="rental-btn rental-btn--primary rental-handover__submit"
        disabled={handover.isPending}
        onClick={confirm}
      >
        {isShip ? <Truck aria-hidden /> : <PackageCheck aria-hidden />}
        {handover.isPending ? 'Đang tải ảnh lên…' : isShip ? 'Xác nhận đã giao' : 'Xác nhận đã nhận'}
      </button>

      <p className="rental-pay__escrow">
        <ShieldCheck aria-hidden />
        {isShip
          ? 'Ảnh chỉ bạn, người thuê và ToyFlow xem được. Tiền vẫn nằm trong ví ký quỹ cho đến khi bạn nhận lại đồ.'
          : 'Chỉ xác nhận khi đồ chơi đã ở trong tay bạn. Quá hạn mà chưa xác nhận, hệ thống tự xác nhận và bắt đầu tính thời gian thuê.'}
      </p>
    </section>
  )
}

/** Hồ sơ bàn giao ở cột chính: ảnh hai phía đặt cạnh nhau để đối chiếu, kèm mốc giờ */
export function RentalHandoverRecord({ order }: { order: RentalOrderDetail }) {
  const handover = order.handover
  if (!handover) return null

  return (
    <section className="rental-block" aria-labelledby="handover-title">
      <h2 id="handover-title" className="rental-section-title">
        Bàn giao
      </h2>
      <div className="rental-handover-record">
        <div className="rental-handover-record__side">
          <p className="rental-handover-record__label">
            <Truck aria-hidden /> Lúc giao · chủ đồ
          </p>
          {handover.shippedAt && (
            <time className="rental-handover-record__time" dateTime={handover.shippedAt}>
              {formatDateTime(handover.shippedAt)}
            </time>
          )}
          <ImageGallery images={handover.ownerPhotos.map((photo) => ({ url: photo.url, key: photo.publicId }))} size={72} />
        </div>

        <div className="rental-handover-record__side">
          <p className="rental-handover-record__label">
            <PackageCheck aria-hidden /> Lúc nhận · người thuê
          </p>
          {handover.receivedAt ? (
            <>
              <time className="rental-handover-record__time" dateTime={handover.receivedAt}>
                {formatDateTime(handover.receivedAt)}
              </time>
              <ImageGallery
                images={handover.renterPhotos.map((photo) => ({ url: photo.url, key: photo.publicId }))}
                size={72}
              />
            </>
          ) : handover.autoConfirmed ? (
            <p className="rental-handover-record__empty">
              Hệ thống tự xác nhận vì quá hạn, người thuê không gửi ảnh lúc nhận.
            </p>
          ) : (
            <p className="rental-handover-record__empty">Đang chờ người thuê kiểm tra và xác nhận.</p>
          )}
        </div>
      </div>
      {order.rentalStartedAt && (
        <p className="rental-block__note">Thời gian thuê bắt đầu tính từ {formatDateTime(order.rentalStartedAt)}.</p>
      )}
    </section>
  )
}
