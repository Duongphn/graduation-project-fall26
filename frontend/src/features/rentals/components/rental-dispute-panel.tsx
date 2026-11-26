import { useQuery } from '@tanstack/react-query'
import { App, Input } from 'antd'
import { Clock, MessageSquareReply, Scale, ShieldCheck } from 'lucide-react'
import { useId, useState } from 'react'
import { ImageGallery, QueryErrorAlert } from '../../../components/common'
import { useListingPhotos } from '../../toy-listings/hooks/use-listing-photos'
import type { ToyImage } from '../../toy-listings/toy-listing-api'
import {
  rentalDisputeQuery,
  RESPONSE_MESSAGE_MAX,
  RESPONSE_MESSAGE_MIN,
  useRespondRentalDispute,
  type RentalDispute,
} from '../rental-orders-api'
import { complaintReasonLabel, DISPUTE_STATUS_META, formatDateTime, formatRemaining } from '../rental-display'
import { RentalPhotoPicker } from './rental-photo-picker'

const NO_PHOTOS: ToyImage[] = []
const ROLE_LABEL = { renter: 'Người thuê', owner: 'Chủ đồ' } as const

function Photos({ photos }: { photos: ToyImage[] }) {
  if (photos.length === 0) return null
  return <ImageGallery images={photos.map((photo) => ({ url: photo.url, key: photo.publicId }))} size={72} />
}

/** UC18: bên bị khiếu nại giải thích (10–1000 ký tự) kèm ảnh nếu có; gửi một lần, hỏi lại trước khi gửi */
function RespondForm({ orderId, dispute, remaining }: { orderId: string; dispute: RentalDispute; remaining: string }) {
  const { modal } = App.useApp()
  const messageId = useId()
  const [message, setMessage] = useState('')
  const [touched, setTouched] = useState(false)
  const photos = useListingPhotos(NO_PHOTOS)
  const respond = useRespondRentalDispute(orderId)
  const length = message.trim().length
  const messageError =
    touched && length < RESPONSE_MESSAGE_MIN ? `Giải thích rõ hơn, ít nhất ${RESPONSE_MESSAGE_MIN} ký tự.` : null

  const submit = () => {
    setTouched(true)
    if (length < RESPONSE_MESSAGE_MIN) return
    const files = photos.newFiles
    modal.confirm({
      title: 'Gửi phản hồi khiếu nại?',
      content: `Bạn chỉ phản hồi được một lần. Giải thích${files.length > 0 ? ` và ${files.length} ảnh` : ''} của bạn được chuyển cho quản trị viên ToyFlow cùng hồ sơ của bên khiếu nại.`,
      okText: 'Gửi phản hồi',
      cancelText: 'Xem lại',
      onOk: () => respond.mutateAsync({ message, photos: files }).catch(() => undefined),
    })
  }

  return (
    <div className="rental-dispute__respond">
      <p className="rental-decision__due">
        <Clock aria-hidden />
        Hạn phản hồi {formatDateTime(dispute.replyDueAt)} · <strong>{remaining}</strong>
      </p>
      <h3 className="rental-decision__title">Phản hồi của bạn</h3>
      <p className="rental-decision__text">
        Nêu rõ tình trạng đồ chơi theo bạn biết, dẫn lại ảnh lúc giao hoặc lúc trả. Không phản hồi trong hạn, khiếu nại
        vẫn được chuyển cho quản trị viên quyết định.
      </p>

      <div className="rental-return__note">
        <label htmlFor={messageId}>Giải thích</label>
        <Input.TextArea
          id={messageId}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onBlur={() => setTouched(true)}
          maxLength={RESPONSE_MESSAGE_MAX}
          showCount
          autoSize={{ minRows: 3, maxRows: 6 }}
          status={messageError ? 'error' : undefined}
          aria-invalid={Boolean(messageError)}
          aria-describedby={messageError ? `${messageId}-error` : undefined}
          disabled={respond.isPending}
          placeholder="VD: Lúc giao, bánh xe còn nguyên như ảnh đã chụp; vết nứt xuất hiện sau khi sử dụng."
        />
        {messageError && (
          <p id={`${messageId}-error`} className="rental-photos__errors">
            {messageError}
          </p>
        )}
      </div>

      <RentalPhotoPicker
        label="Ảnh bổ sung (không bắt buộc)"
        photos={photos.photos}
        rejections={photos.rejections}
        disabled={respond.isPending}
        onAddFiles={photos.addFiles}
        onRemove={photos.removePhoto}
      />

      <button
        type="button"
        className="rental-btn rental-btn--primary rental-handover__submit"
        disabled={respond.isPending}
        onClick={submit}
      >
        <MessageSquareReply aria-hidden />
        {respond.isPending ? 'Đang gửi…' : 'Gửi phản hồi'}
      </button>
    </div>
  )
}

/** Ai đang làm gì tiếp theo khi không còn form phản hồi */
function DisputeProgress({ dispute, remaining }: { dispute: RentalDispute; remaining: string | null }) {
  if (dispute.status === 'resolved' || dispute.status === 'closed') return null
  const isClaimant = dispute.viewerRole === 'claimant'
  const counterpart = dispute.claimant === 'renter' ? 'chủ đồ' : 'người thuê'

  let text: string
  if (dispute.response) {
    text = 'Quản trị viên ToyFlow đang xem xét ảnh và giải thích của cả hai bên.'
  } else if (isClaimant && remaining) {
    text = `Đang chờ ${counterpart} phản hồi trước ${formatDateTime(dispute.replyDueAt)} (${remaining}). Hết hạn, khiếu nại chuyển cho quản trị viên quyết định.`
  } else {
    text = `${isClaimant ? `Bên ${counterpart} không` : 'Bạn đã không'} phản hồi trong hạn. Quản trị viên ToyFlow đang xem xét hồ sơ.`
  }
  return (
    <p className="rental-dispute__progress">
      <Scale aria-hidden />
      {text}
    </p>
  )
}

/**
 * Khiếu nại của đơn (UC17–UC19): nội dung và ảnh của bên khiếu nại, phản hồi của bên còn lại. Bên bị khiếu
 * nại thấy form phản hồi trong 72 giờ. Phán quyết và số tiền hiện ở mục Quyết toán của đơn.
 */
export function RentalDisputePanel({ orderId, now }: { orderId: string; now: number }) {
  const query = useQuery(rentalDisputeQuery(orderId))
  const dispute = query.data

  if (query.isPending) return <div className="rental-handover rental-dispute is-loading" aria-busy="true" />
  if (query.isError || !dispute) {
    return <QueryErrorAlert error={query.error} onRetry={() => void query.refetch()} />
  }

  const isClaimant = dispute.viewerRole === 'claimant'
  const remaining = formatRemaining(dispute.replyDueAt, now)
  const status = DISPUTE_STATUS_META[dispute.status]
  const claimant = ROLE_LABEL[dispute.claimant]
  const respondent = ROLE_LABEL[dispute.claimant === 'renter' ? 'owner' : 'renter']

  return (
    <section className="rental-handover rental-dispute" aria-labelledby="dispute-title">
      <div className="rental-dispute__head">
        <h2 id="dispute-title" className="rental-decision__title">
          Khiếu nại {dispute.code}
        </h2>
        <span className={`rental-status rental-status--${status.tone}`}>{status.label}</span>
      </div>

      <div className="rental-dispute__section">
        <p className="rental-dispute__heading">
          {isClaimant ? 'Bạn' : claimant} khiếu nại · {complaintReasonLabel(dispute.reason)}
          <time dateTime={dispute.openedAt}>{formatDateTime(dispute.openedAt)}</time>
        </p>
        <blockquote className="rental-return-record__note">{dispute.description}</blockquote>
        <Photos photos={dispute.evidencePhotos} />
      </div>

      {dispute.response && (
        <div className="rental-dispute__section">
          <p className="rental-dispute__heading">
            Phản hồi của {isClaimant ? respondent.toLowerCase() : 'bạn'}
            <time dateTime={dispute.response.respondedAt}>{formatDateTime(dispute.response.respondedAt)}</time>
          </p>
          <blockquote className="rental-return-record__note">{dispute.response.message}</blockquote>
          <Photos photos={dispute.response.photos} />
        </div>
      )}

      {/* canRespond do server tính; remaining kiểm lại theo đồng hồ trang để form tự ẩn khi vừa hết hạn */}
      {dispute.canRespond && remaining ? (
        <RespondForm orderId={orderId} dispute={dispute} remaining={remaining} />
      ) : (
        <DisputeProgress dispute={dispute} remaining={remaining} />
      )}

      {dispute.status !== 'resolved' && dispute.status !== 'closed' && (
        <p className="rental-pay__escrow">
          <ShieldCheck aria-hidden />
          Tiền thuê và tiền cọc được giữ trong ví ký quỹ ToyFlow cho đến khi có phán quyết.
        </p>
      )}
    </section>
  )
}
