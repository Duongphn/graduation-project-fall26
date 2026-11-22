import { Card, Descriptions, Empty, Skeleton, Table, Typography } from 'antd'
import { Link, useParams } from 'react-router-dom'

import { PageHeader, QueryErrorAlert, StatusTag } from '../../../components/common'
import type { ReportReason, ReportTargetKind } from '../../../constants/domain'
import {
  reportActionLabels,
  reportReasonLabels,
  reportTargetKindLabels,
} from '../../../constants/labels'
import { adminHomeCrumb, adminPaths } from '../../../routes/paths'
import { formatDate, formatDateTime } from '../../../utils/format'
import { AccountEnforcementCard } from '../components/AccountEnforcementCard'
import { useAccount } from '../hooks'
import type { AccountViolation } from '../types'

// UC29, R03 III.7.2.1 (4)-(10): read-only profile, metrics, violation history and the lock or
// unlock form.
export function AccountDetailPage() {
  const { id } = useParams<{ id: string }>()
  const detail = useAccount(id)
  const account = detail.data

  return (
    <>
      <PageHeader
        title={account?.fullName ?? 'Tài khoản'}
        breadcrumb={[
          adminHomeCrumb,
          { title: 'Quản lý người dùng', to: adminPaths.users },
          { title: 'Chi tiết tài khoản' },
        ]}
        actions={account && <StatusTag domain="user" status={account.accountStatus} />}
      />
      {detail.error ? (
        <QueryErrorAlert error={detail.error} onRetry={() => void detail.refetch()} />
      ) : !account ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:col-span-2">
            <Card title="Hồ sơ">
              <Descriptions
                column={{ xs: 1, md: 2 }}
                items={[
                  { key: 'name', label: 'Họ tên', children: account.fullName },
                  { key: 'phone', label: 'Số điện thoại', children: account.phone },
                  { key: 'email', label: 'Email', children: account.email },
                  { key: 'joined', label: 'Ngày tham gia', children: formatDate(account.createdAt) },
                  {
                    key: 'identity',
                    label: 'Xác minh danh tính',
                    children: <StatusTag domain="identity" status={account.verificationStatus} />,
                  },
                  { key: 'trust', label: 'Điểm tin cậy', children: account.trustScore ?? '—' },
                  { key: 'violations', label: 'Số vi phạm', children: account.violationCount },
                  { key: 'pending', label: 'Báo cáo chờ xử lý', children: account.pendingReportCount },
                  { key: 'listings', label: 'Tin đang hiển thị', children: account.activeListingCount },
                ]}
              />
            </Card>
            {account.lock && (
              <Card title="Đang bị khóa">
                <Descriptions
                  column={1}
                  items={[
                    { key: 'reason', label: 'Lý do', children: account.lock.reason ?? '—' },
                    {
                      key: 'until',
                      label: 'Thời hạn',
                      children: account.lock.until ? `Đến ${formatDateTime(account.lock.until)}` : 'Vĩnh viễn',
                    },
                    { key: 'at', label: 'Khóa lúc', children: formatDateTime(account.lock.lockedAt) },
                    { key: 'by', label: 'Người khóa', children: account.lock.lockedBy?.fullName ?? '—' },
                    { key: 'hidden', label: 'Tin bị ẩn khi khóa', children: account.lock.hiddenListingCount },
                  ]}
                />
              </Card>
            )}
            <Card title="Lịch sử vi phạm">
              {account.violations.length === 0 ? (
                <Empty description="Chưa có vi phạm nào." />
              ) : (
                <Table<AccountViolation>
                  rowKey="reportId"
                  size="small"
                  pagination={false}
                  dataSource={account.violations}
                  columns={[
                    { title: 'Ngày', key: 'date', render: (_, row) => formatDate(row.resolvedAt) },
                    {
                      title: 'Nguồn',
                      key: 'source',
                      render: (_, row) => (
                        <Link to={adminPaths.violationReport(row.reportId)}>
                          Báo cáo {reportTargetKindLabels[row.targetKind as ReportTargetKind]?.toLowerCase() ?? ''}
                        </Link>
                      ),
                    },
                    {
                      title: 'Lý do',
                      key: 'reason',
                      render: (_, row) => reportReasonLabels[row.reason as ReportReason] ?? row.reason,
                    },
                    {
                      title: 'Xử lý',
                      key: 'action',
                      render: (_, row) => (
                        <div className="flex flex-col">
                          <span>{row.action ? reportActionLabels[row.action] : '—'}</span>
                          {row.note && (
                            <Typography.Text type="secondary" className="text-xs">
                              {row.note}
                            </Typography.Text>
                          )}
                        </div>
                      ),
                    },
                  ]}
                />
              )}
            </Card>
          </div>
          <AccountEnforcementCard key={account.accountStatus} account={account} />
        </div>
      )}
    </>
  )
}
