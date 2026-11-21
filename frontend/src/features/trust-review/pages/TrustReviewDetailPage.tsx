import { Alert, Card, Col, Descriptions, Empty, List, Row, Skeleton, Tag, Typography } from 'antd'
import { Link, useParams } from 'react-router-dom'

import { PageHeader, QueryErrorAlert } from '../../../components/common'
import { adminHomeCrumb, adminPaths, toyDetailPath } from '../../../routes/paths'
import { ReviewItem } from '../../reviews/components/review-item'
import { DISPUTE_VERDICT_LABELS, formatDateTime } from '../../rentals/rental-display'
import type { DisputeVerdict } from '../../rentals/rental-orders-api'
import { formatVnd } from '../../toy-listings/format-vnd'
import { TrustDecisionForm } from '../components/TrustDecisionForm'
import { TrustScoreBadge } from '../components/TrustScoreBadge'
import { formatTrustScore, TRUST_DECISION_LABELS, TRUST_FORMULA } from '../format'
import { useTrustReviewDetail } from '../hooks'
import type { TrustReviewDetail } from '../types'

const verdictLabel = (verdict: string) => DISPUTE_VERDICT_LABELS[verdict as DisputeVerdict] ?? verdict

/** Điểm được tạo thành thế nào: Admin thấy phần nào kéo điểm xuống trước khi quyết định */
function ScoreBreakdownCard({ data }: { data: TrustReviewDetail }) {
  const { ratingMultiplier, cancelPenalty, disputePenalty, windowDays } = TRUST_FORMULA
  const fromRating = data.ratingAverage === null ? null : data.ratingAverage * ratingMultiplier
  const rows = [
    {
      label: `Đánh giá nhận được (${data.reviewCount} lượt, TB ${data.ratingAverage?.toFixed(2).replace('.', ',') ?? '—'}★ × ${ratingMultiplier})`,
      value: fromRating === null ? '—' : `+${Math.round(fromRating)}`,
      tone: undefined,
    },
    {
      label: `Huỷ vì không thanh toán (${data.cancellations} × ${cancelPenalty})`,
      value: `−${data.cancellations * cancelPenalty}`,
      tone: data.cancellations > 0 ? ('warning' as const) : undefined,
    },
    {
      label: `Khiếu nại bị xử thua (${data.disputesLostCount} × ${disputePenalty})`,
      value: `−${data.disputesLostCount * disputePenalty}`,
      tone: data.disputesLostCount > 0 ? ('danger' as const) : undefined,
    },
  ]

  return (
    <Card title={`Điểm tin cậy · ${windowDays} ngày gần nhất`} extra={<TrustScoreBadge score={data.score} />}>
      <div className="flex flex-col">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-4 border-b border-dashed border-tf-surface py-2">
            <Typography.Text type="secondary">{row.label}</Typography.Text>
            <Typography.Text strong type={row.tone} className="tabular-nums">
              {row.value}
            </Typography.Text>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-4 pt-3">
          <Typography.Text strong>Điểm (làm tròn, giới hạn 0–100)</Typography.Text>
          <Typography.Text strong className="text-lg tabular-nums">
            {formatTrustScore(data.score)}
          </Typography.Text>
        </div>
        {data.score === null && (
          <Typography.Text type="secondary" className="pt-2 text-xs">
            Chưa đủ số đánh giá tối thiểu nên chưa có điểm. Người chưa có điểm không bao giờ bị chặn.
          </Typography.Text>
        )}
      </div>
    </Card>
  )
}

function ReviewsCard({ data }: { data: TrustReviewDetail }) {
  return (
    <Card title={`Đánh giá nhận được (${data.reviews.length})`}>
      {data.reviews.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có đánh giá nào trong khoảng thời gian tính điểm." />
      ) : (
        <ul className="review-list">
          {data.reviews.map((review, index) => (
            <ReviewItem
              key={review.id}
              review={review}
              index={index}
              roleLabel={review.direction === 'RENTER_TO_OWNER' ? 'Người thuê viết' : 'Chủ đồ viết'}
            />
          ))}
        </ul>
      )}
    </Card>
  )
}

function PenaltiesCard({ data }: { data: TrustReviewDetail }) {
  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} md={12}>
        <Card title={`Đơn huỷ vì không thanh toán (${data.expiredOrders.length})`} className="h-full">
          <List
            size="small"
            dataSource={data.expiredOrders}
            locale={{ emptyText: 'Không có' }}
            renderItem={(order) => (
              <List.Item extra={<Typography.Text type="secondary" className="text-xs">{formatDateTime(order.expiredAt)}</Typography.Text>}>
                <Typography.Text className="tabular-nums">{order.code}</Typography.Text>
              </List.Item>
            )}
          />
        </Card>
      </Col>
      <Col xs={24} md={12}>
        <Card title={`Khiếu nại bị xử thua (${data.disputesLost.length})`} className="h-full">
          <List
            size="small"
            dataSource={data.disputesLost}
            locale={{ emptyText: 'Không có' }}
            renderItem={(dispute) => (
              <List.Item extra={<Typography.Text type="secondary" className="text-xs">{formatDateTime(dispute.resolvedAt)}</Typography.Text>}>
                <span className="flex flex-col">
                  <Link to={adminPaths.dispute(dispute.disputeId)} className="tabular-nums">
                    {dispute.code}
                  </Link>
                  <Typography.Text type="secondary" className="text-xs">
                    {verdictLabel(dispute.verdict)}
                  </Typography.Text>
                </span>
              </List.Item>
            )}
          />
        </Card>
      </Col>
    </Row>
  )
}

/** Trạng thái hiện tại: đang chờ, đang được ân hạn, quyết định gần nhất */
function StatusCard({ data }: { data: TrustReviewDetail }) {
  return (
    <Card title="Tình trạng">
      <Descriptions size="small" column={1} bordered>
        <Descriptions.Item label="Số điện thoại">
          <span className="tabular-nums">{data.phone}</span>
        </Descriptions.Item>
        <Descriptions.Item label="Chờ xem xét từ">
          {data.requestedAt ? formatDateTime(data.requestedAt) : 'Không còn trong danh sách'}
        </Descriptions.Item>
        {data.lastBlocked && (
          <Descriptions.Item label="Bị chặn khi thuê">
            <span className="flex flex-col">
              <Link to={toyDetailPath(data.lastBlocked.toyId)} target="_blank">
                {data.lastBlocked.toyTitle ?? 'Tin đã ẩn hoặc bị xoá'}
              </Link>
              <Typography.Text type="secondary" className="text-xs">
                Cọc {formatVnd(data.lastBlocked.depositAmount)} · {formatDateTime(data.lastBlocked.attemptAt)}
              </Typography.Text>
            </span>
          </Descriptions.Item>
        )}
        <Descriptions.Item label="Ân hạn">
          {data.override ? `Đến ${formatDateTime(data.override.allowedUntil)}` : 'Không có'}
        </Descriptions.Item>
      </Descriptions>
      {data.lastDecision && (
        <div className="mt-4 flex flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <Tag color={data.lastDecision.decision === 'ALLOW' ? 'green' : 'red'} className="!m-0">
              {TRUST_DECISION_LABELS[data.lastDecision.decision]}
            </Tag>
            <Typography.Text type="secondary" className="text-xs">
              {formatDateTime(data.lastDecision.decidedAt)} · điểm lúc đó {formatTrustScore(data.lastDecision.scoreAtDecision)}
            </Typography.Text>
          </span>
          <Typography.Paragraph className="!mb-0 whitespace-pre-line">{data.lastDecision.reason}</Typography.Paragraph>
        </div>
      )}
    </Card>
  )
}

// UC24: the Admin reads why a renter's score is low and either allows renting for a grace period
// or keeps the restriction. Opening this page recomputes the score on the server.
export function TrustReviewDetailPage() {
  const { userId = '' } = useParams()
  const query = useTrustReviewDetail(userId)
  const data = query.data
  const breadcrumb = [
    adminHomeCrumb,
    { title: 'Xem xét điểm tin cậy', to: adminPaths.trustReviews },
    { title: data?.fullName || 'Người dùng' },
  ]

  if (!data) {
    return (
      <>
        <PageHeader title="Xem xét điểm tin cậy" breadcrumb={breadcrumb} />
        {query.error ? (
          <QueryErrorAlert error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <Skeleton active paragraph={{ rows: 8 }} />
        )}
      </>
    )
  }

  const pending = Boolean(data.requestedAt)

  return (
    <>
      <PageHeader
        title={data.fullName || 'Người dùng'}
        description="Điểm vừa được tính lại khi mở trang."
        breadcrumb={breadcrumb}
        actions={<TrustScoreBadge score={data.score} />}
      />
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={16}>
          <div className="flex flex-col gap-4">
            <ScoreBreakdownCard data={data} />
            <PenaltiesCard data={data} />
            <ReviewsCard data={data} />
          </div>
        </Col>
        <Col xs={24} xl={8}>
          <div className="flex flex-col gap-4">
            {pending ? (
              <TrustDecisionForm userId={data.userId} fullName={data.fullName} />
            ) : (
              <Alert
                type="success"
                showIcon
                message="Đã có quyết định"
                description="Người dùng không còn trong danh sách chờ. Họ chỉ vào lại khi bị chặn tiếp và điểm đã thay đổi."
              />
            )}
            <StatusCard data={data} />
          </div>
        </Col>
      </Row>
    </>
  )
}
