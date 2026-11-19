import { Button, Tag, Typography } from 'antd'
import type { TableProps } from 'antd'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { DataTable, PageHeader, RelativeTime, StatusTabs, StatusTag } from '../../../components/common'
import { useListParams } from '../../../hooks/useListParams'
import { adminHomeCrumb, adminPaths } from '../../../routes/paths'
import { formatDateTime, formatMoney } from '../../../utils/format'
import { useDisputes } from '../hooks'
import { DISPUTE_REASON_LABELS } from '../ruling'
import type { DisputeListItem } from '../types'

const filtersSchema = z.object({
  status: z.enum(['open', 'resolved']).catch('open'),
})

const TABS = ['open', 'resolved'] as const

// UC19: rental disputes waiting for a ruling (oldest first) and the resolved ones.
export function DisputeListPage() {
  const navigate = useNavigate()
  const { params, filters, setPage, setFilter } = useListParams({ schema: filtersSchema })
  const { status } = filters
  const disputes = useDisputes({ ...params, status })

  const openCase = (id: string) => navigate(adminPaths.dispute(id))

  const columns: TableProps<DisputeListItem>['columns'] = [
    {
      title: 'Khiếu nại',
      key: 'code',
      render: (_, item) => (
        <div className="flex flex-col">
          <Typography.Text strong>{item.code}</Typography.Text>
          <Typography.Text type="secondary">Đơn {item.order.code}</Typography.Text>
        </div>
      ),
    },
    {
      title: 'Đồ chơi',
      key: 'toy',
      render: (_, item) => item.toy?.title ?? '—',
    },
    {
      title: 'Chủ đồ / Người thuê',
      key: 'parties',
      render: (_, item) => (
        <div className="flex flex-col">
          <span>{item.owner?.fullName ?? '—'}</span>
          <Typography.Text type="secondary">{item.renter?.fullName ?? '—'}</Typography.Text>
        </div>
      ),
    },
    {
      title: 'Lý do',
      dataIndex: 'reason',
      render: (value: string) => DISPUTE_REASON_LABELS[value] ?? value,
    },
    {
      title: 'Tiền đang giữ',
      dataIndex: 'frozenAmount',
      render: (value: number) => formatMoney(value),
    },
    {
      title: 'Mở lúc',
      dataIndex: 'openedAt',
      render: (value: string) => <RelativeTime value={value} />,
    },
    status === 'open'
      ? {
          title: 'Hạn phản hồi',
          key: 'replyDueAt',
          render: (_, item) =>
            new Date(item.replyDueAt).getTime() > Date.now() ? (
              <Tag color="processing">Đến {formatDateTime(item.replyDueAt)}</Tag>
            ) : (
              <Tag color="warning">Chờ quyết định</Tag>
            ),
        }
      : {
          title: 'Giải quyết lúc',
          dataIndex: 'resolvedAt',
          render: (value: string | undefined) => formatDateTime(value),
        },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      render: (value: DisputeListItem['status']) => <StatusTag domain="dispute" status={value} />,
    },
    {
      title: 'Thao tác',
      key: 'actions',
      fixed: 'right',
      render: (_, item) => (
        <Button type="link" onClick={() => openCase(item.id)}>
          {status === 'open' ? 'Xem xét' : 'Xem'}
        </Button>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Giải quyết khiếu nại"
        description="Xem bằng chứng của chủ đồ và người thuê, rồi quyết định phần tiền cọc bồi thường cho chủ đồ và phần hoàn cho người thuê."
        breadcrumb={[adminHomeCrumb, { title: 'Giải quyết khiếu nại' }]}
      />
      <StatusTabs
        domain="dispute"
        statuses={TABS}
        showAll={false}
        value={status}
        onChange={(next) => setFilter('status', next === 'open' ? undefined : next)}
      />
      <DataTable<DisputeListItem>
        columns={columns}
        items={disputes.data?.items}
        pagination={disputes.data?.pagination}
        loading={disputes.isFetching}
        error={disputes.error}
        onRetry={() => void disputes.refetch()}
        onPageChange={setPage}
        onRowOpen={(item) => openCase(item.id)}
        locale={{ emptyText: status === 'open' ? 'Không có khiếu nại nào chờ quyết định' : 'Chưa có khiếu nại nào được giải quyết' }}
      />
    </>
  )
}
