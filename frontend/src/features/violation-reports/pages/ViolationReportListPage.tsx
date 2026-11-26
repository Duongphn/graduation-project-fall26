import { EyeOutlined, WarningFilled } from '@ant-design/icons'
import { Button, Select, Tag, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { Link, useNavigate } from 'react-router-dom'

import {
  DataTable,
  FilterBar,
  PageHeader,
  RelativeTime,
  StatusTabs,
} from '../../../components/common'
import type { ReportReason, ReportTargetKind } from '../../../constants/domain'
import {
  reportActionLabels,
  reportReasonLabels,
  reportTargetKindLabels,
  toOptions,
} from '../../../constants/labels'
import { useListParams } from '../../../hooks/useListParams'
import { adminHomeCrumb, adminPaths } from '../../../routes/paths'
import { useReportCounts, useReports } from '../hooks'
import { reportFiltersSchema } from '../schemas'
import type { ReportListItem } from '../types'

// UC29: violation reports. Pending: unsafe toy reports first (GB-49), then the oldest first.
export function ViolationReportListPage() {
  const navigate = useNavigate()
  const { params, filters, setPage, setFilter } = useListParams({ schema: reportFiltersSchema })
  const isPending = filters.status === 'pending'
  const reports = useReports(params)
  const counts = useReportCounts({
    ...(filters.reason ? { reason: filters.reason } : {}),
    ...(filters.targetKind ? { targetKind: filters.targetKind } : {}),
  })

  const columns: TableColumnsType<ReportListItem> = [
    {
      title: 'Lý do',
      key: 'reason',
      render: (_, item) => (
        <div className="flex flex-col items-start gap-1">
          {item.isUnsafe ? (
            <Tag color="red" icon={<WarningFilled />} className="m-0">
              {reportReasonLabels[item.reason]}
            </Tag>
          ) : (
            <span>{reportReasonLabels[item.reason]}</span>
          )}
          <Typography.Paragraph type="secondary" className="!mb-0 w-60 text-xs" ellipsis={{ rows: 2, tooltip: true }}>
            {item.description}
          </Typography.Paragraph>
        </div>
      ),
    },
    {
      title: 'Đối tượng',
      key: 'target',
      render: (_, item) => (
        <div className="flex max-w-64 flex-col">
          <Typography.Text type="secondary" className="text-xs">
            {reportTargetKindLabels[item.target.kind]}
          </Typography.Text>
          <Link to={adminPaths.violationReport(item.id)}>{item.target.label ?? 'Không còn tồn tại'}</Link>
        </div>
      ),
    },
    {
      title: 'Người bị báo cáo',
      key: 'reportedUser',
      render: (_, item) =>
        item.reportedUser ? (
          <Link to={adminPaths.user(item.reportedUser.id)}>{item.reportedUser.fullName ?? '—'}</Link>
        ) : (
          '—'
        ),
    },
    { title: 'Người báo cáo', key: 'reporter', render: (_, item) => item.reporter?.fullName ?? '—' },
    { title: 'Ảnh', key: 'evidence', render: (_, item) => item.evidenceCount },
    { title: 'Gửi lúc', key: 'createdAt', render: (_, item) => <RelativeTime value={item.createdAt} /> },
    ...(!isPending
      ? [
          {
            title: 'Kết quả',
            key: 'resolution',
            render: (_: unknown, item: ReportListItem) =>
              item.resolution ? reportActionLabels[item.resolution.action] : '—',
          },
        ]
      : []),
    {
      title: 'Thao tác',
      key: 'actions',
      fixed: 'right',
      render: (_, item) => (
        <Button
          type={isPending ? 'primary' : 'default'}
          icon={<EyeOutlined />}
          onClick={() => navigate(adminPaths.violationReport(item.id))}
        >
          {isPending ? 'Xem & xử lý' : 'Xem chi tiết'}
        </Button>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Báo cáo vi phạm"
        description="Báo cáo đồ chơi không an toàn được xếp lên đầu (GB-49). Xử lý: bỏ qua, gỡ tin, cảnh cáo hoặc khóa tài khoản (UC29)."
        breadcrumb={[adminHomeCrumb, { title: 'Báo cáo vi phạm' }]}
      />

      <StatusTabs
        domain="report"
        showAll={false}
        value={filters.status}
        counts={counts.data}
        onChange={(next) => setFilter('status', next === 'pending' ? undefined : next)}
      />

      <FilterBar>
        <Select<ReportReason>
          allowClear
          placeholder="Lý do"
          aria-label="Lý do"
          className="w-64"
          value={filters.reason}
          options={toOptions(reportReasonLabels)}
          onChange={(value) => setFilter('reason', value)}
        />
        <Select<ReportTargetKind>
          allowClear
          placeholder="Loại đối tượng"
          aria-label="Loại đối tượng"
          className="w-44"
          value={filters.targetKind}
          options={toOptions(reportTargetKindLabels)}
          onChange={(value) => setFilter('targetKind', value)}
        />
      </FilterBar>

      <DataTable<ReportListItem>
        items={reports.data?.items}
        pagination={reports.data?.pagination}
        error={reports.error}
        onRetry={() => void reports.refetch()}
        loading={reports.isFetching}
        columns={columns}
        onPageChange={setPage}
        onRowOpen={(item) => navigate(adminPaths.violationReport(item.id))}
        scroll={{ x: 1000 }}
        locale={{ emptyText: isPending ? 'Không có báo cáo nào đang chờ xử lý.' : 'Không có báo cáo nào.' }}
      />
    </>
  )
}
