import { Button, Input, Tag, Typography } from 'antd'
import type { TableProps } from 'antd'
import { useNavigate } from 'react-router-dom'

import {
  AgeTag,
  DataTable,
  FilterBar,
  PageHeader,
  RelativeTime,
  StatusTabs,
  StatusTag,
  UserSummary,
} from '../../../components/common'
import { verificationStatuses } from '../../../constants/domain'
import { useListParams } from '../../../hooks/useListParams'
import { adminHomeCrumb, adminPaths } from '../../../routes/paths'
import { formatDateTime } from '../../../utils/format'
import { useIdentityCounts, useIdentityQueue } from '../hooks'
import { identityQueueFiltersSchema } from '../schemas'
import type { IdentityQueueItem } from '../types'

// UC27 (identity part): queue of identity verifications, oldest pending first.
export function IdentityVerificationListPage() {
  const navigate = useNavigate()
  const { params, filters, setPage, setFilter } = useListParams({
    schema: identityQueueFiltersSchema,
  })
  const { status, q: search } = filters

  const queue = useIdentityQueue(params)
  const counts = useIdentityCounts()

  const openVerification = (id: string) => navigate(adminPaths.identityVerification(id))

  const columns: TableProps<IdentityQueueItem>['columns'] = [
    {
      title: 'Người dùng',
      key: 'user',
      render: (_, item) => (
        <UserSummary
          user={
            item.user && {
              fullName: item.user.fullName,
              phone: item.user.maskedPhone,
              email: item.user.maskedEmail,
            }
          }
        />
      ),
    },
    {
      title: 'Tuổi',
      key: 'age',
      render: (_, item) => (item.user ? <AgeTag age={item.user.age} /> : '—'),
    },
    {
      title: 'Gửi lúc',
      dataIndex: 'submittedAt',
      render: (value: string) => <RelativeTime value={value} />,
    },
    {
      title: 'Lần gửi trước',
      dataIndex: 'previousAttempts',
      render: (value: number) =>
        value === 0 ? (
          <Typography.Text type="secondary">Lần đầu</Typography.Text>
        ) : (
          <Tag color="warning">{value} lần</Tag>
        ),
    },
    ...(status === 'PENDING'
      ? []
      : [
          {
            title: 'Xử lý lúc',
            dataIndex: 'reviewedAt',
            render: (value: string | null) => formatDateTime(value),
          },
        ]),
    ...(status === 'REJECTED'
      ? [
          {
            title: 'Lý do từ chối',
            dataIndex: 'rejectReason',
            width: 280,
            ellipsis: true,
            render: (value: string | null) => value ?? '—',
          },
        ]
      : []),
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      render: (value: IdentityQueueItem['status']) => <StatusTag domain="identity" status={value} />,
    },
    {
      title: 'Thao tác',
      key: 'actions',
      fixed: 'right',
      render: (_, item) => (
        <Button type="link" onClick={() => openVerification(item.id)}>
          {item.status === 'PENDING' ? 'Xem xét' : 'Xem'}
        </Button>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Xác minh danh tính"
        description="Đối chiếu CCCD hai mặt với ảnh chân dung bằng mắt (không có eKYC tự động), rồi xác minh hoặc từ chối kèm lý do."
        breadcrumb={[adminHomeCrumb, { title: 'Xác minh danh tính' }]}
      />
      <StatusTabs
        domain="identity"
        statuses={verificationStatuses}
        showAll={false}
        value={status}
        counts={counts.data}
        onChange={(next) => setFilter('status', next === 'PENDING' ? undefined : next)}
      />
      <FilterBar>
        <Input.Search
          key={search ?? ''}
          defaultValue={search}
          allowClear
          enterButton
          className="max-w-md"
          maxLength={100}
          placeholder="Tìm theo họ tên, số điện thoại hoặc email"
          onSearch={(value) => setFilter('q', value.trim() || undefined)}
        />
      </FilterBar>
      <DataTable<IdentityQueueItem>
        columns={columns}
        items={queue.data?.items}
        pagination={queue.data?.pagination}
        loading={queue.isFetching}
        error={queue.error}
        onRetry={() => void queue.refetch()}
        onPageChange={setPage}
        onRowOpen={(item) => openVerification(item.id)}
        locale={{
          emptyText: status === 'PENDING' ? 'Không còn yêu cầu nào chờ duyệt' : 'Không có yêu cầu nào',
        }}
      />
    </>
  )
}
