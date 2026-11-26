import { Alert, Card, Descriptions, Tag, Timeline, Typography } from 'antd'

import { ImageGallery } from '../../../components/common'
import { formatDate, formatDateTime, formatMoney } from '../../../utils/format'
import { RENTAL_STATUS_META, useNow } from '../../rentals/rental-display'
import type { ToyImage } from '../../toy-listings/toy-listing-api'
import { DISPUTE_REASON_LABELS } from '../ruling'
import type { DisputeDetail, DisputeParty } from '../types'

const DAY_MS = 86_400_000
// R03 III.7.4.1 field 1: a case is flagged after 7 days (the target time).
const TARGET_DAYS = 7

const toGallery = (photos: ToyImage[] | undefined) =>
  (photos ?? []).map((photo) => ({ url: photo.url, key: photo.publicId }))

function Party({ party, role }: { party: DisputeParty | null; role: 'owner' | 'renter' }) {
  if (!party) return <Typography.Text type="secondary">Không tìm thấy tài khoản</Typography.Text>
  return (
    <span className="flex flex-wrap items-center gap-2">
      {party.fullName}
      {role === 'renter' && party.trustScore !== undefined && (
        <Tag color="blue" className="m-0">
          Điểm tin cậy {party.trustScore}
        </Tag>
      )}
    </span>
  )
}

/** Case panel: toy, both parties, reason, frozen amount and how long the case has been open. */
export function DisputeCaseCard({ dispute }: { dispute: DisputeDetail }) {
  const { pricing, returnInfo } = dispute.rentalOrder
  const now = useNow()
  const openDays = Math.floor((now - new Date(dispute.openedAt).getTime()) / DAY_MS)
  const isOpen = dispute.status === 'open' || dispute.status === 'under_review'

  return (
    <Card title="Hồ sơ khiếu nại" size="small">
      {isOpen && openDays >= TARGET_DAYS && (
        <Alert className="mb-3" type="warning" showIcon title={`Khiếu nại đã mở ${openDays} ngày, quá thời hạn xử lý 7 ngày.`} />
      )}
      <Descriptions column={1} size="small">
        <Descriptions.Item label="Đồ chơi">{dispute.toy?.title ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="Đơn thuê">
          {dispute.order.code} · {formatDate(dispute.rentalOrder.period.startDate)} → {formatDate(dispute.rentalOrder.period.endDate)}
        </Descriptions.Item>
        <Descriptions.Item label="Chủ đồ">
          <Party party={dispute.owner} role="owner" />
        </Descriptions.Item>
        <Descriptions.Item label="Người thuê">
          <Party party={dispute.renter} role="renter" />
        </Descriptions.Item>
        <Descriptions.Item label="Bên khiếu nại">{dispute.claimant === 'owner' ? 'Chủ đồ' : 'Người thuê'}</Descriptions.Item>
        <Descriptions.Item label="Lý do">{DISPUTE_REASON_LABELS[dispute.reason] ?? dispute.reason}</Descriptions.Item>
        <Descriptions.Item label="Tiền đang giữ">
          {formatMoney(dispute.frozenAmount)} (thuê {formatMoney(pricing.rentalFee)} + cọc {formatMoney(pricing.depositAmount)})
        </Descriptions.Item>
        {returnInfo && returnInfo.lateFee > 0 && (
          <Descriptions.Item label="Phí trả trễ">
            {formatMoney(returnInfo.lateFee)} ({returnInfo.lateDays} ngày, trừ vào cọc)
          </Descriptions.Item>
        )}
        <Descriptions.Item label="Mở lúc">
          {formatDateTime(dispute.openedAt)}
          {isOpen && openDays > 0 && ` (đã mở ${openDays} ngày)`}
        </Descriptions.Item>
        <Descriptions.Item label="Hạn phản hồi">{formatDateTime(dispute.replyDueAt)}</Descriptions.Item>
      </Descriptions>
    </Card>
  )
}

function EvidenceBlock({ title, at, photos, text }: { title: string; at?: string | undefined; photos?: ToyImage[] | undefined; text?: string | undefined }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Typography.Text strong>{title}</Typography.Text>
        {at && <Typography.Text type="secondary">{formatDateTime(at)}</Typography.Text>}
      </div>
      <ImageGallery images={toGallery(photos)} size={88} label={title} />
      {text && <blockquote className="m-0 border-l-4 border-border pl-3 italic">{text}</blockquote>}
    </div>
  )
}

/**
 * Evidence of both sides, side by side (R03 III.7.4.1 fields 2–4). The claim sits with the party who
 * opened it (Owner: damage found on return; Renter: problem found on receipt, UC17) and the reply
 * (UC18) with the other party.
 */
export function DisputeEvidence({ dispute }: { dispute: DisputeDetail }) {
  const { handover, returnInfo } = dispute.rentalOrder
  const claim = (
    <EvidenceBlock
      title={dispute.claimant === 'owner' ? 'Ảnh hư hỏng khi nhận lại' : 'Khiếu nại khi nhận đồ'}
      at={dispute.openedAt}
      photos={dispute.evidencePhotos}
      text={dispute.description}
    />
  )
  const reply = dispute.response ? (
    <EvidenceBlock
      title="Phản hồi khiếu nại"
      at={dispute.response.respondedAt}
      photos={dispute.response.photos}
      text={dispute.response.message}
    />
  ) : (
    <Typography.Text type="secondary">Chưa phản hồi khiếu nại.</Typography.Text>
  )

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card title="Bằng chứng của chủ đồ" size="small">
        <div className="flex flex-col gap-4">
          <EvidenceBlock title="Ảnh lúc giao đồ" at={handover?.shippedAt} photos={handover?.ownerPhotos} />
          {dispute.claimant === 'owner' ? claim : reply}
        </div>
      </Card>
      <Card title="Bằng chứng của người thuê" size="small">
        <div className="flex flex-col gap-4">
          <EvidenceBlock
            title="Ảnh lúc nhận đồ"
            at={handover?.receivedAt}
            photos={handover?.renterPhotos}
            text={handover?.autoConfirmed ? 'Hệ thống tự xác nhận nhận hàng (người thuê không gửi ảnh).' : undefined}
          />
          {returnInfo && (
            <EvidenceBlock title="Ảnh lúc trả đồ" at={returnInfo.requestedAt} photos={returnInfo.photos} text={returnInfo.note} />
          )}
          {dispute.claimant === 'renter' ? claim : reply}
        </div>
      </Card>
    </div>
  )
}

/** Case history, newest first (R03 III.7.4.1 field 5). */
export function DisputeHistory({ dispute }: { dispute: DisputeDetail }) {
  return (
    <Card title="Lịch sử đơn thuê" size="small">
      <Timeline
        items={[...dispute.history].reverse().map((entry, index) => ({
          key: `${entry.occurredAt}-${index}`,
          content: (
            <div className="flex flex-col gap-1">
              <Typography.Text strong>{RENTAL_STATUS_META[entry.newStatus].label}</Typography.Text>
              {entry.notes && <Typography.Text>{entry.notes}</Typography.Text>}
              <Typography.Text type="secondary">{formatDateTime(entry.occurredAt)}</Typography.Text>
            </div>
          ),
        }))}
      />
    </Card>
  )
}
