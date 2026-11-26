import { WarningFilled } from '@ant-design/icons'
import { Alert, Card, Descriptions, Image, Skeleton, Tag, Typography } from 'antd'
import { Link, useParams } from 'react-router-dom'

import {
  ListingTypeTag,
  PageHeader,
  QueryErrorAlert,
  StatusTag,
  Thumbnail,
} from '../../../components/common'
import type { ListingType } from '../../../constants/domain'
import {
  lockDurationLabels,
  reportActionLabels,
  reportReasonLabels,
  reportTargetKindLabels,
  unsafeIssueLabels,
} from '../../../constants/labels'
import { adminHomeCrumb, adminPaths } from '../../../routes/paths'
import { formatDateTime } from '../../../utils/format'
import { ResolveReportCard } from '../components/ResolveReportCard'
import { useReport } from '../hooks'
import type { ReportDetail } from '../types'

function ReportTarget({ report }: { report: ReportDetail }) {
  if (report.toy) {
    return (
      <div className="flex items-center gap-3">
        <Thumbnail src={report.toy.coverImage} alt={report.toy.title} size={64} />
        <div className="flex flex-col items-start gap-1">
          <Link to={adminPaths.toy(report.toy.id)} className="font-medium">
            {report.toy.title}
          </Link>
          <div className="flex gap-1">
            <ListingTypeTag type={report.toy.listingType as ListingType} />
            <StatusTag domain="toy" status={report.toy.status} />
          </div>
          {report.toy.rejectReason && (
            <Typography.Text type="secondary" className="text-xs">
              Lý do ẩn: {report.toy.rejectReason}
            </Typography.Text>
          )}
        </div>
      </div>
    )
  }
  if (report.message) {
    // R03 I.4.4 [12]: the Admin sees the message only while reviewing the report.
    return (
      <div className="flex flex-col gap-1">
        <Typography.Paragraph className="!mb-0 rounded-md border border-border bg-surface p-3">
          {report.message.content}
        </Typography.Paragraph>
        <Typography.Text type="secondary" className="text-xs">
          Gửi lúc {formatDateTime(report.message.sentAt)}
        </Typography.Text>
      </div>
    )
  }
  if (report.target.kind === 'user' && report.target.label) {
    return <span>{report.target.label}</span>
  }
  return <Typography.Text type="secondary">Đối tượng không còn tồn tại.</Typography.Text>
}

// UC29: one report with its target, the reported user and the evidence, and the action form.
export function ViolationReportDetailPage() {
  const { id } = useParams<{ id: string }>()
  const detail = useReport(id)
  const report = detail.data

  return (
    <>
      <PageHeader
        title="Chi tiết báo cáo vi phạm"
        breadcrumb={[
          adminHomeCrumb,
          { title: 'Báo cáo vi phạm', to: adminPaths.violationReports },
          { title: 'Chi tiết báo cáo' },
        ]}
        actions={report && <StatusTag domain="report" status={report.status} />}
      />
      {detail.error ? (
        <QueryErrorAlert error={detail.error} onRetry={() => void detail.refetch()} />
      ) : !report ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:col-span-2">
            <Card title="Nội dung báo cáo">
              {report.isUnsafe && (
                <Alert
                  className="mb-4"
                  type="error"
                  showIcon
                  icon={<WarningFilled />}
                  title="Báo cáo đồ chơi không an toàn"
                  description={report.unsafeIssues.map((issue) => unsafeIssueLabels[issue]).join(', ')}
                />
              )}
              <Descriptions
                column={1}
                items={[
                  { key: 'reason', label: 'Lý do', children: reportReasonLabels[report.reason] },
                  { key: 'description', label: 'Mô tả', children: report.description },
                  {
                    key: 'kind',
                    label: 'Loại đối tượng',
                    children: reportTargetKindLabels[report.target.kind],
                  },
                  { key: 'target', label: 'Đối tượng', children: <ReportTarget report={report} /> },
                  {
                    key: 'reporter',
                    label: 'Người báo cáo',
                    children: report.reporter
                      ? `${report.reporter.fullName ?? '—'} · ${report.reporter.maskedPhone}`
                      : '—',
                  },
                  { key: 'createdAt', label: 'Gửi lúc', children: formatDateTime(report.createdAt) },
                ]}
              />
            </Card>
            <Card title={`Ảnh bằng chứng (${report.evidence.length})`}>
              {report.evidence.length === 0 ? (
                <Typography.Text type="secondary">Người báo cáo không gửi ảnh.</Typography.Text>
              ) : (
                <Image.PreviewGroup>
                  <div className="flex flex-wrap gap-2">
                    {report.evidence.map((photo, index) =>
                      photo.url ? (
                        <Image key={photo.url} src={photo.url} width={120} height={120} className="object-cover" alt={`Ảnh ${index + 1}`} />
                      ) : (
                        <Tag key={index}>Ảnh {index + 1}: chưa cấu hình lưu trữ ảnh</Tag>
                      ),
                    )}
                  </div>
                </Image.PreviewGroup>
              )}
            </Card>
            {report.resolution && (
              <Card title="Kết quả xử lý">
                <Descriptions
                  column={1}
                  items={[
                    {
                      key: 'action',
                      label: 'Cách xử lý',
                      children: `${reportActionLabels[report.resolution.action]}${
                        report.resolution.lockDuration
                          ? ` (${lockDurationLabels[report.resolution.lockDuration].toLowerCase()})`
                          : ''
                      }`,
                    },
                    { key: 'note', label: 'Ghi chú', children: report.resolution.note ?? '—' },
                    { key: 'by', label: 'Admin', children: report.resolution.resolvedBy?.fullName ?? '—' },
                    { key: 'at', label: 'Lúc', children: formatDateTime(report.resolution.resolvedAt) },
                    ...(report.resolution.viaReportId
                      ? [
                          {
                            key: 'via',
                            label: 'Xử lý cùng',
                            children: (
                              <Link to={adminPaths.violationReport(report.resolution.viaReportId)}>
                                Báo cáo liên quan
                              </Link>
                            ),
                          },
                        ]
                      : []),
                  ]}
                />
              </Card>
            )}
          </div>
          <div className="flex flex-col gap-4">
            <Card title="Người bị báo cáo">
              {report.reportedUser ? (
                <Descriptions
                  column={1}
                  items={[
                    {
                      key: 'name',
                      label: 'Họ tên',
                      children: <Link to={adminPaths.user(report.reportedUser.id)}>{report.reportedUser.fullName}</Link>,
                    },
                    { key: 'phone', label: 'Số điện thoại', children: report.reportedUser.maskedPhone },
                    {
                      key: 'status',
                      label: 'Trạng thái',
                      children: (
                        <div className="flex flex-col items-start gap-1">
                          <StatusTag domain="user" status={report.reportedUser.accountStatus} />
                          {report.reportedUser.lockedUntil && (
                            <Typography.Text type="secondary" className="text-xs">
                              đến {formatDateTime(report.reportedUser.lockedUntil)}
                            </Typography.Text>
                          )}
                        </div>
                      ),
                    },
                    { key: 'violations', label: 'Số vi phạm', children: report.reportedUser.violationCount },
                    { key: 'pending', label: 'Báo cáo chờ xử lý', children: report.reportedUser.pendingReportCount },
                  ]}
                />
              ) : (
                <Typography.Text type="secondary">Không tìm thấy tài khoản.</Typography.Text>
              )}
            </Card>
            {report.status === 'pending' && <ResolveReportCard key={report.id} report={report} />}
          </div>
        </div>
      )}
    </>
  )
}
