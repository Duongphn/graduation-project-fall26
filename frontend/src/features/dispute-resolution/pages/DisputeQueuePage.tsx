import { EyeOutlined } from '@ant-design/icons'
import { Button, Tag, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { DataTable, PageHeader, RelativeTime, StatusTabs } from '../../../components/common'
import { disputeStatuses } from '../../../constants/domain'
import { useListParams } from '../../../hooks/useListParams'
import { adminHomeCrumb, adminPaths } from '../../../routes/paths'
import { enumParam } from '../../../schemas/list-params'
import { COMPLAINT_REASON_META, DISPUTE_VERDICT_LABELS } from '../../rentals/rental-display'
import { formatVnd } from '../../toy-listings/format-vnd'
import { ROLE_LABELS } from '../format'
import { useAdminDisputes } from '../hooks'
import type { AdminDispute } from '../types'

const filtersSchema = z.object({ status: enumParam(disputeStatuses) })
const TABS = ['under_review', 'open', 'resolved'] as const

// UC19: disputes waiting for a verdict (oldest review first), with tabs for the other statuses.
export function DisputeQueuePage() {
  const navigate = useNavigate()
  const { params, filters, setPage, setFilter } = useListParams({ schema: filtersSchema })
  const status = filters.status ?? 'under_review'
  const isReviewTab = status === 'under_review'
  const list = useAdminDisputes({ ...params, status })
  const openCase = (id: string) => navigate(adminPaths.dispute(id))

  const columns: TableColumnsType<AdminDispute> = [
    {
      title: 'Khiếu nại',
      key: 'code',
      render: (_, item) => (
        <div className="flex flex-col gap-1">
          <Link to={adminPaths.dispute(item.id)} className="font-medium">
            {item.code}
          </Link>
          <Typography.Text type="secondary" className="text-xs">
            {ROLE_LABELS[item.claimantRole]} khiếu nại
          </Typography.Text>
        </div>
      ),
    },
    {
      title: 'Lý do',
      key: 'reason',
      render: (_, item) => (
        <div className="flex max-w-80 flex-col gap-1">
          <span>{COMPLAINT_REASON_META[item.reason].label}</span>
          <Typography.Paragraph type="secondary" className="!mb-0 text-xs" ellipsis={{ rows: 2, tooltip: true }}>
            {item.description}
          </Typography.Paragraph>
        </div>
      ),
    },
    {
      title: 'Phản hồi',
      key: 'response',
      render: (_, item) =>
        item.response ? (
          <Tag color="blue">Đã phản hồi</Tag>
        ) : item.responseMissed ? (
          <Tag color="orange">Không phản hồi</Tag>
        ) : (
          <Tag>Đang chờ</Tag>
        ),
    },
    {
      title: isReviewTab ? 'Chờ phân xử từ' : 'Mở lúc',
      key: 'time',
      render: (_, item) => <RelativeTime value={isReviewTab ? (item.reviewStartedAt ?? item.openedAt) : item.openedAt} />,
    },
    ...(status === 'resolved'
      ? [
          {
            title: 'Phán quyết',
            key: 'verdict',
            render: (_: unknown, item: AdminDispute) =>
              item.resolution ? (
                <div className="flex flex-col gap-1">
                  <span>{DISPUTE_VERDICT_LABELS[item.resolution.verdict]}</span>
                  <Typography.Text type="secondary" className="text-xs">
                    Bồi thường {formatVnd(item.resolution.compensation)}
                  </Typography.Text>
                </div>
              ) : (
                '—'
              ),
          },
        ]
      : []),
    {
      title: 'Thao tác',
      key: 'actions',
      fixed: 'right',
      render: (_, item) => (
        <Button type={isReviewTab ? 'primary' : 'default'} icon={<EyeOutlined />} onClick={() => openCase(item.id)}>
          {isReviewTab ? 'Xem & phân xử' : 'Xem hồ sơ'}
        </Button>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Khiếu nại"
        description="Khiếu nại đã có phản hồi hoặc hết 72 giờ chờ phản hồi cần Admin phân xử. Tiền ký quỹ của đơn được giữ đến khi có phán quyết."
        breadcrumb={[adminHomeCrumb, { title: 'Khiếu nại' }]}
      />

      <StatusTabs
        domain="dispute"
        showAll={false}
        statuses={TABS}
        value={status}
        onChange={(next) => setFilter('status', next === 'under_review' ? undefined : next)}
      />

      <DataTable<AdminDispute>
        items={list.data?.items}
        pagination={list.data?.pagination}
        error={list.error}
        onRetry={() => void list.refetch()}
        loading={list.isFetching}
        columns={columns}
        onPageChange={setPage}
        onRowOpen={(item) => openCase(item.id)}
        locale={{ emptyText: isReviewTab ? 'Không có khiếu nại nào cần phân xử.' : 'Không có khiếu nại nào.' }}
      />
    </>
  )
}
