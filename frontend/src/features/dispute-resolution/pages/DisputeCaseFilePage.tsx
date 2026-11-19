import { CheckCircleFilled, SafetyCertificateOutlined, UserOutlined } from '@ant-design/icons'
import { Alert, Avatar, Card, Col, Descriptions, Empty, Row, Skeleton, Tag, Timeline, Typography } from 'antd'
import type { ReactNode } from 'react'
import { useParams } from 'react-router-dom'

import { ImageGallery, PageHeader, QueryErrorAlert, StatusTag } from '../../../components/common'
import { adminHomeCrumb, adminPaths } from '../../../routes/paths'
import type { ToyImage } from '../../toy-listings/toy-listing-api'
import { formatVnd } from '../../toy-listings/format-vnd'
import {
  COMPLAINT_REASON_META,
  DISPUTE_VERDICT_LABELS,
  formatDateTime,
  formatFullDate,
  RENTAL_STATUS_META,
} from '../../rentals/rental-display'
import { DisputeVerdictForm } from '../components/DisputeVerdictForm'
import { actorName, ROLE_LABELS } from '../format'
import { useAdminDisputeCase } from '../hooks'
import type { AdminDisputeCase, DisputeParty } from '../types'

const gallery = (photos: ToyImage[] | undefined) => (photos ?? []).map((photo) => ({ url: photo.url, key: photo.publicId }))

function PartyCard({ party, role, title }: { party: DisputeParty; role: string; title: string }) {
  return (
    <Card size="small" title={title}>
      <div className="flex items-center gap-3">
        <Avatar src={party.avatar} icon={<UserOutlined />} size={40} />
        <div className="flex flex-col">
          <Typography.Text strong>
            {party.fullName || '—'} {party.verified && <CheckCircleFilled className="!text-green-600" aria-label="Đã xác thực" />}
          </Typography.Text>
          <Typography.Text type="secondary" className="text-xs">
            {role} · Điểm tin cậy {party.trustScore === undefined ? 'chưa có' : party.trustScore.toFixed(1)}
          </Typography.Text>
        </div>
      </div>
    </Card>
  )
}

function Statement({ title, time, children }: { title: ReactNode; time?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Typography.Text strong>{title}</Typography.Text>
        {time && <Typography.Text type="secondary" className="text-xs">{formatDateTime(time)}</Typography.Text>}
      </div>
      {children}
    </div>
  )
}

/** Mô tả + ảnh của bên khiếu nại và phản hồi của bên còn lại (hoặc ghi rõ là không phản hồi) */
function StatementsCard({ data }: { data: AdminDisputeCase }) {
  const { dispute, claimant, respondent } = data
  const respondentRole = ROLE_LABELS[dispute.claimantRole === 'renter' ? 'owner' : 'renter']
  return (
    <Card title="Ý kiến hai bên">
      <div className="flex flex-col gap-5">
        <Statement
          title={`${claimant.fullName} (${ROLE_LABELS[dispute.claimantRole].toLowerCase()}) khiếu nại · ${COMPLAINT_REASON_META[dispute.reason].label}`}
          time={dispute.openedAt}
        >
          <Typography.Paragraph className="!mb-0 whitespace-pre-line">{dispute.description}</Typography.Paragraph>
          <ImageGallery size={96} images={gallery(dispute.evidencePhotos)} label="Ảnh bằng chứng" />
        </Statement>

        <Statement title={`${respondent.fullName} (${respondentRole.toLowerCase()}) phản hồi`} time={dispute.response?.respondedAt}>
          {dispute.response ? (
            <>
              <Typography.Paragraph className="!mb-0 whitespace-pre-line">{dispute.response.message}</Typography.Paragraph>
              {dispute.response.photos.length > 0 && (
                <ImageGallery size={96} images={gallery(dispute.response.photos)} label="Ảnh phản hồi" />
              )}
            </>
          ) : dispute.responseMissed ? (
            <Alert type="warning" showIcon message="Không phản hồi trong 72 giờ." />
          ) : (
            <Typography.Text type="secondary">
              Chưa phản hồi{dispute.responseDueAt ? `, hạn ${formatDateTime(dispute.responseDueAt)}` : ''}.
            </Typography.Text>
          )}
        </Statement>
      </div>
    </Card>
  )
}

/** Ảnh tình trạng đồ chơi theo từng bước để đối chiếu: lúc giao, lúc nhận, lúc trả, bằng chứng hư hỏng */
function PhotosCard({ data }: { data: AdminDisputeCase }) {
  const { order } = data.caseFile
  const steps = [
    { key: 'ship', title: 'Lúc giao (chủ đồ chụp)', photos: order.handover?.ownerPhotos, time: order.handover?.shippedAt },
    { key: 'receive', title: 'Lúc nhận (người thuê chụp)', photos: order.handover?.renterPhotos, time: order.handover?.receivedAt },
    { key: 'return', title: 'Lúc trả (người thuê chụp)', photos: order.returnInfo?.photos, time: order.returnInfo?.requestedAt },
  ]
  return (
    <Card title="Ảnh theo từng bước">
      <div className="flex flex-col gap-5">
        {steps.map((step) => (
          <Statement key={step.key} title={step.title} time={step.time}>
            {step.photos && step.photos.length > 0 ? (
              <ImageGallery size={96} images={gallery(step.photos)} label={step.title} />
            ) : (
              <Typography.Text type="secondary">Chưa có ảnh ở bước này.</Typography.Text>
            )}
          </Statement>
        ))}
        {order.returnInfo?.note && (
          <Typography.Text type="secondary">Ghi chú lúc trả: {order.returnInfo.note}</Typography.Text>
        )}
      </div>
    </Card>
  )
}

function HistoryCard({ data }: { data: AdminDisputeCase }) {
  const { history, order } = data.caseFile
  return (
    <Card title="Lịch sử đơn" extra={<Typography.Text type="secondary">{order.code}</Typography.Text>}>
      <Typography.Paragraph type="secondary">
        Thuê từ {formatFullDate(order.period.startDate)} đến {formatFullDate(order.period.endDate)}.
      </Typography.Paragraph>
      <Timeline
        items={history.map((entry) => ({
          children: (
            <div className="flex flex-col">
              <Typography.Text strong>{RENTAL_STATUS_META[entry.newStatus].label}</Typography.Text>
              <Typography.Text type="secondary" className="text-xs">
                {formatDateTime(entry.occurredAt)} · {actorName(data, entry.changedBy)}
              </Typography.Text>
              {entry.notes && <Typography.Text className="text-xs">{entry.notes}</Typography.Text>}
            </div>
          ),
        }))}
      />
    </Card>
  )
}

/** Chat và đánh giá AI chưa được xây ở server: nói rõ, không hiển thị dữ liệu giả */
function NotAvailableCard() {
  return (
    <Card title="Trao đổi và đánh giá AI">
      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Lịch sử chat giữa hai bên chưa được hỗ trợ." />
        </Col>
        <Col xs={24} md={12}>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Đánh giá hư hỏng bằng AI chưa được hỗ trợ." />
        </Col>
      </Row>
    </Card>
  )
}

function EscrowCard({ data }: { data: AdminDisputeCase }) {
  const { rentalFee, depositAmount, platformFee, lateFee } = data.caseFile.amounts
  return (
    <Card title="Tiền đang giữ trong ký quỹ" extra={<SafetyCertificateOutlined />}>
      <Descriptions size="small" column={1}>
        <Descriptions.Item label="Tiền thuê">{formatVnd(rentalFee)}</Descriptions.Item>
        <Descriptions.Item label="Tiền cọc">{formatVnd(depositAmount)}</Descriptions.Item>
        <Descriptions.Item label="Trong đó phí nền tảng">{formatVnd(platformFee)}</Descriptions.Item>
        <Descriptions.Item label="Phí trả trễ">{formatVnd(lateFee)}</Descriptions.Item>
        <Descriptions.Item label={<strong>Tổng</strong>}>
          <strong>{formatVnd(rentalFee + depositAmount)}</strong>
        </Descriptions.Item>
      </Descriptions>
    </Card>
  )
}

function ResolutionCard({ data }: { data: AdminDisputeCase }) {
  const resolution = data.dispute.resolution
  if (!resolution) return null
  return (
    <Card title="Phán quyết đã ban hành">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Tag color="green">{DISPUTE_VERDICT_LABELS[resolution.verdict]}</Tag>
          <Typography.Text type="secondary" className="text-xs">
            {formatDateTime(resolution.resolvedAt)}
          </Typography.Text>
        </div>
        <Typography.Paragraph className="!mb-0 whitespace-pre-line">{resolution.reason}</Typography.Paragraph>
        <Descriptions size="small" column={1} bordered>
          <Descriptions.Item label="Bồi thường">{formatVnd(resolution.compensation)}</Descriptions.Item>
          <Descriptions.Item label="Người thuê nhận">{formatVnd(resolution.payout.renter)}</Descriptions.Item>
          <Descriptions.Item label="Chủ đồ nhận">{formatVnd(resolution.payout.owner)}</Descriptions.Item>
          <Descriptions.Item label="Nền tảng">{formatVnd(resolution.payout.platform)}</Descriptions.Item>
        </Descriptions>
      </div>
    </Card>
  )
}

// UC19: the Admin reads the whole case (statements, photos per step, order timeline) and issues
// one final verdict that splits the escrow and completes the order.
export function DisputeCaseFilePage() {
  const { id = '' } = useParams()
  const query = useAdminDisputeCase(id)
  const data = query.data
  const breadcrumb = [adminHomeCrumb, { title: 'Khiếu nại', to: adminPaths.disputes }, { title: data?.dispute.code ?? 'Hồ sơ' }]

  if (!data) {
    return (
      <>
        <PageHeader title="Hồ sơ khiếu nại" breadcrumb={breadcrumb} />
        {query.error ? (
          <QueryErrorAlert error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <Skeleton active paragraph={{ rows: 8 }} />
        )}
      </>
    )
  }

  const { dispute, claimant, respondent } = data
  const respondentRole = ROLE_LABELS[dispute.claimantRole === 'renter' ? 'owner' : 'renter']

  return (
    <>
      <PageHeader
        title={`Khiếu nại ${dispute.code}`}
        description={`Đơn thuê ${data.caseFile.order.code} · ${COMPLAINT_REASON_META[dispute.reason].label}`}
        breadcrumb={breadcrumb}
        actions={<StatusTag domain="dispute" status={dispute.status} />}
      />
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={16}>
          <div className="flex flex-col gap-4">
            <StatementsCard data={data} />
            <PhotosCard data={data} />
            <HistoryCard data={data} />
            <NotAvailableCard />
          </div>
        </Col>
        <Col xs={24} xl={8}>
          <div className="flex flex-col gap-4">
            <EscrowCard data={data} />
            {dispute.status === 'under_review' && <DisputeVerdictForm data={data} />}
            {dispute.status === 'open' && (
              <Alert
                type="info"
                showIcon
                message="Đang chờ bên bị khiếu nại phản hồi"
                description={
                  dispute.responseDueAt
                    ? `Hạn ${formatDateTime(dispute.responseDueAt)}. Sau khi phản hồi hoặc hết hạn, khiếu nại chuyển sang chờ phân xử.`
                    : undefined
                }
              />
            )}
            <ResolutionCard data={data} />
            <PartyCard party={claimant} role={ROLE_LABELS[dispute.claimantRole]} title="Bên khiếu nại" />
            <PartyCard party={respondent} role={respondentRole} title="Bên bị khiếu nại" />
          </div>
        </Col>
      </Row>
    </>
  )
}
