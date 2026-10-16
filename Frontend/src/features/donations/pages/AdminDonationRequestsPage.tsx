import { Button, Input, Select, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { Link, useNavigate } from 'react-router-dom'

import {
  DataTable,
  FilterBar,
  PageHeader,
  RelativeTime,
  StatusTabs,
  StatusTag,
  Thumbnail,
} from '../../../components/common'
import type { DonationReceiverType, DonationStatus } from '../../../constants/domain'
import { donationReceiverTypeLabels, toOptions } from '../../../constants/labels'
import { useListParams } from '../../../hooks/useListParams'
import { adminHomeCrumb, adminPaths } from '../../../routes/paths'
import { donationSortFields } from '../constants'
import type { DonationSortField } from '../constants'
import { useDonationCounts, useDonationRequests } from '../hooks'
import { donationFiltersSchema } from '../schemas'
import type { DonationRequest } from '../types'

const toSortOrder = (order: 'asc' | 'desc' | undefined) =>
  order === 'asc' ? 'ascend' : order === 'desc' ? 'descend' : null

const isSortField = (value: unknown): value is DonationSortField =>
  donationSortFields.some((field) => field === value)

// Admin queue of donation requests (FE-02 / BF-04), filtered by status tabs.
export function AdminDonationRequestsPage() {
  const navigate = useNavigate()
  const list = useListParams({ schema: donationFiltersSchema, sortFields: donationSortFields })
  const { status, receiverType, q } = list.filters
  const query = useDonationRequests(list.params)
  const counts = useDonationCounts({
    ...(receiverType ? { receiverType } : {}),
    ...(q ? { q } : {}),
  })

  const columns: TableColumnsType<DonationRequest> = [
    {
      title: 'Mã',
      dataIndex: 'code',
      key: 'code',
      sorter: true,
      sortOrder: list.sortBy === 'code' ? toSortOrder(list.sortOrder) : null,
      render: (code: string, row) => <Link to={adminPaths.donationRequest(row.id)}>{code}</Link>,
    },
    {
      title: 'Đồ chơi',
      key: 'toy',
      render: (_, row) => (
        <Thumbnail src={row.toy?.imageUrl} alt={row.toy?.title} caption={row.toy?.title ?? '—'} />
      ),
    },
    { title: 'Người tặng', key: 'donor', render: (_, row) => row.donor?.fullName ?? '—' },
    {
      title: 'Bên nhận',
      key: 'receiver',
      render: (_, row) => (
        <div className="flex flex-col">
          <span>{row.organization?.name ?? row.requester?.fullName ?? '—'}</span>
          <Typography.Text type="secondary">
            {donationReceiverTypeLabels[row.receiverType]}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      render: (value: DonationStatus) => <StatusTag domain="donation" status={value} />,
    },
    {
      title: 'Gửi lúc',
      dataIndex: 'createdAt',
      key: 'createdAt',
      sorter: true,
      sortOrder: list.sortBy === 'createdAt' ? toSortOrder(list.sortOrder) : null,
      render: (value: string) => <RelativeTime value={value} />,
    },
    {
      title: 'Thao tác',
      key: 'actions',
      fixed: 'right',
      render: (_, row) => (
        <Button type="link" onClick={() => navigate(adminPaths.donationRequest(row.id))}>
          Xem chi tiết
        </Button>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Yêu cầu nhận tặng"
        description="Duyệt, từ chối, huỷ và xác nhận nhận hàng thay bên nhận."
        breadcrumb={[adminHomeCrumb, { title: 'Yêu cầu nhận tặng' }]}
      />
      <StatusTabs
        domain="donation"
        value={status}
        onChange={(next) => list.setFilter('status', next)}
        counts={counts.data}
      />
      <FilterBar extra={<Button onClick={list.reset}>Xoá bộ lọc</Button>}>
        <Input.Search
          key={q ?? ''}
          allowClear
          className="w-72"
          placeholder="Tìm theo mã yêu cầu hoặc tên đồ chơi"
          defaultValue={q}
          onSearch={(value) => list.setFilter('q', value.trim() || undefined)}
        />
        <Select<DonationReceiverType>
          allowClear
          className="w-44"
          placeholder="Loại bên nhận"
          value={receiverType}
          options={toOptions(donationReceiverTypeLabels)}
          onChange={(value) => list.setFilter('receiverType', value)}
        />
      </FilterBar>
      <DataTable<DonationRequest>
        columns={columns}
        items={query.data?.items}
        pagination={query.data?.pagination}
        loading={query.isFetching}
        error={query.error}
        onRetry={() => void query.refetch()}
        onPageChange={list.setPage}
        onRowOpen={(row) => navigate(adminPaths.donationRequest(row.id))}
        onChange={(_pagination, _filters, sorter, extra) => {
          if (extra.action !== 'sort') return
          const single = Array.isArray(sorter) ? sorter[0] : sorter
          const field = single?.order && isSortField(single.columnKey) ? single.columnKey : undefined
          list.setSort(field, single?.order === 'ascend' ? 'asc' : 'desc')
        }}
      />
    </>
  )
}
