import { EyeOutlined } from '@ant-design/icons'
import { Button, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { DataTable, PageHeader, RelativeTime } from '../../../components/common'
import { useListParams } from '../../../hooks/useListParams'
import { adminHomeCrumb, adminPaths, toyDetailPath } from '../../../routes/paths'
import { formatVnd } from '../../toy-listings/format-vnd'
import { TrustScoreBadge } from '../components/TrustScoreBadge'
import { useTrustQueue } from '../hooks'
import type { TrustQueueItem } from '../types'

const filtersSchema = z.object({})

// UC24: renters blocked from a high-deposit toy because their Trust Score is too low, oldest first.
export function TrustReviewQueuePage() {
  const navigate = useNavigate()
  const { params, setPage } = useListParams({ schema: filtersSchema })
  const list = useTrustQueue(params)
  const open = (userId: string) => navigate(adminPaths.trustReview(userId))

  const columns: TableColumnsType<TrustQueueItem> = [
    {
      title: 'Người thuê',
      key: 'user',
      render: (_, item) => (
        <div className="flex flex-col gap-1">
          <Link to={adminPaths.trustReview(item.userId)} className="font-medium">
            {item.fullName || '—'}
          </Link>
          <Typography.Text type="secondary" className="text-xs tabular-nums">
            {item.phone}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: 'Điểm tin cậy',
      key: 'score',
      render: (_, item) => <TrustScoreBadge score={item.score} />,
    },
    {
      title: 'Căn cứ (180 ngày)',
      key: 'evidence',
      render: (_, item) => (
        <div className="flex flex-col gap-0.5 text-xs tabular-nums">
          <span>
            {item.reviewCount} đánh giá
            {item.ratingAverage !== null && ` · TB ${item.ratingAverage.toFixed(1).replace('.', ',')}★`}
          </span>
          <Typography.Text type={item.cancellations > 0 ? 'warning' : 'secondary'} className="text-xs">
            {item.cancellations} lần huỷ vì không thanh toán
          </Typography.Text>
          <Typography.Text type={item.disputesLost > 0 ? 'danger' : 'secondary'} className="text-xs">
            {item.disputesLost} khiếu nại bị xử thua
          </Typography.Text>
        </div>
      ),
    },
    {
      title: 'Lần bị chặn gần nhất',
      key: 'blocked',
      render: (_, item) =>
        item.lastBlocked ? (
          <div className="flex max-w-72 flex-col gap-0.5">
            <Link to={toyDetailPath(item.lastBlocked.toyId)} target="_blank" className="truncate">
              {item.lastBlocked.toyTitle ?? 'Tin đã ẩn hoặc bị xoá'}
            </Link>
            <Typography.Text type="secondary" className="text-xs">
              Cọc {formatVnd(item.lastBlocked.depositAmount)}
            </Typography.Text>
          </div>
        ) : (
          '—'
        ),
    },
    {
      title: 'Chờ từ',
      key: 'requestedAt',
      render: (_, item) => (item.requestedAt ? <RelativeTime value={item.requestedAt} /> : '—'),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      fixed: 'right',
      render: (_, item) => (
        <Button type="primary" icon={<EyeOutlined />} onClick={() => open(item.userId)}>
          Xem & quyết định
        </Button>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Xem xét điểm tin cậy"
        description="Người thuê có điểm dưới ngưỡng bị chặn khi đặt món đồ có tiền cọc cao. Cho phép thì họ được đặt thuê trong thời gian ân hạn; giữ hạn chế thì họ được báo lý do."
        breadcrumb={[adminHomeCrumb, { title: 'Xem xét điểm tin cậy' }]}
      />

      <DataTable<TrustQueueItem>
        items={list.data?.items}
        pagination={list.data?.pagination}
        error={list.error}
        onRetry={() => void list.refetch()}
        loading={list.isFetching}
        columns={columns}
        rowKey="userId"
        onPageChange={setPage}
        onRowOpen={(item) => open(item.userId)}
        locale={{ emptyText: 'Không có người dùng nào chờ xem xét.' }}
      />
    </>
  )
}
