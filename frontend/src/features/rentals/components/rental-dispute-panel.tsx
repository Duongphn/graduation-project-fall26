import { useQuery } from '@tanstack/react-query'
import { App, Input } from 'antd'
import { Clock, MessageSquareReply, Scale, ShieldCheck } from 'lucide-react'
import { useId, useState } from 'react'
import { ImageGallery, QueryErrorAlert } from '../../../components/common'
import { formatVnd } from '../../toy-listings/format-vnd'
import { useListingPhotos } from '../../toy-listings/hooks/use-listing-photos'
import type { ToyImage } from '../../toy-listings/toy-listing-api'
import {
  disputeQuery,
  RESPONSE_MESSAGE_MAX,
  RESPONSE_MESSAGE_MIN,
  useRespondDispute,
  type RentalDispute,
} from '../rental-orders-api'
import {
  COMPLAINT_REASON_META,
  DISPUTE_STATUS_META,
  DISPUTE_VERDICT_LABELS,
  formatDateTime,
  formatRemaining,
} from '../rental-display'
import { RentalPhotoPicker } from './rental-photo-picker'

const NO_PHOTOS: ToyImage[] = []
const ROLE_LABEL = { renter: 'Người thuê', owner: 'Chủ đồ' } as const

function Photos({ photos }: { photos: ToyImage[] }) {
  if (photos.length === 0) return null
  return <ImageGallery images={photos.map((photo) => ({ url: photo.url, key: photo.publicId }))} size={72} />
}

/** Bên bị khiếu nại giải thích (10–1000 ký tự) kèm ảnh nếu có; gửi một lần, hỏi lại trước khi gửi */
function RespondForm({ dispute, remaining }: { dispute: RentalDispute; remaining: string }) {
  const { modal } = App.useApp()
  const messageId = useId()
  const [message, setMessage] = useState('')
  const [touched, setTouched] = useState(false)
  const photos = useListingPhotos(NO_PHOTOS)
  const respond = useRespondDispute(dispute.id)
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
      {dispute.responseDueAt && (
        <p className="rental-decision__due">
          <Clock aria-hidden />
          Hạn phản hồi {formatDateTime(dispute.responseDueAt)} · <strong>{remaining}</strong>
        </p>
      )}
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
          placeholder="VD: Lúc giao, bánh xe còn nguyên như ảnh đã chụp; vết nứt xuất hiện sau khi người thuê sử dụng."
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

/** Trạng thái sau khi phản hồi xong hoặc hết hạn: ai đang làm gì tiếp theo */
function DisputeProgress({ dispute, isClaimant, remaining }: { dispute: RentalDispute; isClaimant: boolean; remaining: string | null }) {
  const counterpart = dispute.claimantRole === 'renter' ? 'chủ đồ' : 'người thuê'
  if (dispute.status === 'open') {
    const text = !isClaimant
      ? 'Đã hết hạn phản hồi. Khiếu nại đang được chuyển cho quản trị viên ToyFlow xem xét.'
      : remaining && dispute.responseDueAt
        ? `Đang chờ ${counterpart} phản hồi trước ${formatDateTime(dispute.responseDueAt)} (${remaining}). Hết hạn, khiếu nại tự chuyển cho quản trị viên.`
        : `Đã hết hạn phản hồi của ${counterpart}, khiếu nại đang được chuyển cho quản trị viên.`
    return <p className="rental-dispute__progress">{text}</p>
  }
  if (dispute.status === 'under_review') {
    return (
      <p className="rental-dispute__progress">
        <Scale aria-hidden />
        {dispute.responseMissed
          ? `${isClaimant ? `Bên ${counterpart} không` : 'Bạn đã không'} phản hồi trong 72 giờ. Quản trị viên ToyFlow đang xem xét hồ sơ.`
          : 'Quản trị viên ToyFlow đang xem xét ảnh và giải thích của cả hai bên.'}
      </p>
    )
  }
  return null
}

/** Phán quyết của quản trị viên và tiền mỗi bên nhận từ ví ký quỹ */
function DisputeResolution({ resolution }: { resolution: NonNullable<RentalDispute['resolution']> }) {
  return (
    <div className="rental-dispute__section">
      <p className="rental-dispute__heading">
        {DISPUTE_VERDICT_LABELS[resolution.verdict]}
        <time dateTime={resolution.resolvedAt}>{formatDateTime(resolution.resolvedAt)}</time>
      </p>
      <blockquote className="rental-return-record__note">{resolution.reason}</blockquote>
      <dl className="rental-money">
        <div>
          <dt>Người thuê nhận</dt>
          <dd>{formatVnd(resolution.payout.renter)}</dd>
        </div>
        <div>
          <dt>Chủ đồ nhận</dt>
          <dd>{formatVnd(resolution.payout.owner)}</dd>
        </div>
      </dl>
    </div>
  )
}

/**
 * Khiếu nại của đơn: nội dung bên khiếu nại gửi, phản hồi của bên còn lại và phán quyết. Bên bị khiếu nại
 * thấy form phản hồi trong 72 giờ; sau khi phản hồi (hoặc hết hạn) khiếu nại chuyển sang quản trị viên.
 */
export function RentalDisputePanel({ disputeId, viewerId, now }: { disputeId: string; viewerId: string | undefined; now: number }) {
  const query = useQuery(disputeQuery(disputeId))
  const dispute = query.data

  if (query.isPending) return <div className="rental-handover rental-dispute is-loading" aria-busy="true" />
  if (query.isError || !dispute) {
    return <QueryErrorAlert error={query.error} onRetry={() => void query.refetch()} />
  }

  const isClaimant = dispute.claimantId === viewerId
  const isRespondent = dispute.respondentId === viewerId
  const remaining = dispute.responseDueAt ? formatRemaining(dispute.responseDueAt, now) : null
  const canRespond = isRespondent && dispute.status === 'open' && Boolean(remaining)
  const status = DISPUTE_STATUS_META[dispute.status]
  const claimant = ROLE_LABEL[dispute.claimantRole]
  const respondent = ROLE_LABEL[dispute.claimantRole === 'renter' ? 'owner' : 'renter']

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
          {isClaimant ? 'Bạn' : claimant} khiếu nại · {COMPLAINT_REASON_META[dispute.reason].label}
          <time dateTime={dispute.openedAt}>{formatDateTime(dispute.openedAt)}</time>
        </p>
        <blockquote className="rental-return-record__note">{dispute.description}</blockquote>
        <Photos photos={dispute.evidencePhotos} />
      </div>

      {dispute.response && (
        <div className="rental-dispute__section">
          <p className="rental-dispute__heading">
            Phản hồi của {isRespondent ? 'bạn' : respondent.toLowerCase()}
            <time dateTime={dispute.response.respondedAt}>{formatDateTime(dispute.response.respondedAt)}</time>
          </p>
          <blockquote className="rental-return-record__note">{dispute.response.message}</blockquote>
          <Photos photos={dispute.response.photos} />
        </div>
      )}

      {canRespond && remaining ? (
        <RespondForm dispute={dispute} remaining={remaining} />
      ) : (
        <DisputeProgress dispute={dispute} isClaimant={isClaimant} remaining={remaining} />
      )}

      {dispute.resolution && <DisputeResolution resolution={dispute.resolution} />}

      {dispute.status !== 'resolved' && dispute.status !== 'closed' && (
        <p className="rental-pay__escrow">
          <ShieldCheck aria-hidden />
          Tiền thuê và tiền cọc được giữ trong ví ký quỹ ToyFlow cho đến khi có phán quyết.
        </p>
      )}
    </section>
  )
}
