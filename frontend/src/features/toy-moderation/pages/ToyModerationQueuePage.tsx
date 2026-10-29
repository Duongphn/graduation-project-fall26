import { EyeOutlined } from '@ant-design/icons'
import { Button, Input, Select, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import {
  DataTable,
  FilterBar,
  ListingTypeTag,
  PageHeader,
  RelativeTime,
  StatusTabs,
  StatusTag,
  Thumbnail,
} from '../../../components/common'
import type { ListingType } from '../../../constants/domain'
import { listingTypeLabels, toOptions } from '../../../constants/labels'
import { useListParams } from '../../../hooks/useListParams'
import { adminHomeCrumb, adminPaths } from '../../../routes/paths'
import { useAdminCategoryOptions } from '../../categories/hooks'
import { OwnerCell } from '../components/OwnerCell'
import { queueStatusTabs } from '../constants'
import { formatAgeRange } from '../../../utils/format'
import { formatToyPrice, toQueueLinkState } from '../format'
import { useToyModerationQueue, useToyStatusCounts } from '../hooks'
import { queueFiltersSchema } from '../schemas'
import type { ToyModerationListItem } from '../types'

// UC27: queue of toy posts waiting for the Admin (oldest first), with tabs for other statuses.
export function ToyModerationQueuePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { params, filters, setPage, setFilter } = useListParams({ schema: queueFiltersSchema })
  const { status, listingType, categoryId, q } = filters
  const isPendingTab = status === 'pending'

  const queue = useToyModerationQueue(params)
  const counts = useToyStatusCounts({
    ...(listingType ? { listingType } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(q ? { q } : {}),
  })
  const categories = useAdminCategoryOptions()

  // The detail page gets the current tab and filters, to come back to them after a decision.
  const linkState = toQueueLinkState(location.search)
  const openDetail = (id: string) => navigate(adminPaths.toy(id), { state: linkState })

  const columns: TableColumnsType<ToyModerationListItem> = [
    {
      title: 'Ảnh',
      key: 'cover',
      width: 80,
      render: (_, item) => (
        <div className="flex w-fit flex-col items-center gap-1">
          <Thumbnail src={item.coverImage} alt={item.title} size={56} />
          <Typography.Text type="secondary" className="text-xs">
            {item.imageCount} ảnh
          </Typography.Text>
        </div>
      ),
    },
    {
      title: 'Tin đăng',
      key: 'title',
      render: (_, item) => (
        <div className="flex max-w-80 flex-col gap-1">
          <Link to={adminPaths.toy(item.id)} state={linkState} className="font-medium">
            {item.title}
          </Link>
          <Typography.Text type="secondary" className="text-xs">
            {item.condition} · {formatAgeRange(item.ageRange)}
          </Typography.Text>
          <Typography.Text className="text-xs">
            {formatToyPrice(item.listingType, item)}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: 'Loại',
      key: 'listingType',
      render: (_, item) => <ListingTypeTag type={item.listingType} />,
    },
    {
      title: 'Danh mục',
      key: 'category',
      render: (_, item) =>
        item.category ? (
          <div className="flex flex-col items-start gap-1">
            <span>{item.category.name}</span>
            {item.category.status === 'hidden' && (
              <StatusTag domain="visibility" status="hidden" />
            )}
          </div>
        ) : (
          '—'
        ),
    },
    {
      title: 'Người đăng',
      key: 'owner',
      render: (_, item) => <OwnerCell owner={item.owner} />,
    },
    {
      title: 'Gửi duyệt',
      key: 'submittedAt',
      render: (_, item) => <RelativeTime value={item.moderation.submittedAt} />,
    },
    // Rejected posts are hidden with a reason.
    ...(status === 'hidden'
      ? [
          {
            title: 'Lý do từ chối',
            key: 'rejectReason',
            width: 200,
            render: (_: unknown, item: ToyModerationListItem) => (
              <Typography.Paragraph className="!mb-0 w-44" ellipsis={{ rows: 2, tooltip: true }}>
                {item.moderation.rejectReason ?? '—'}
              </Typography.Paragraph>
            ),
          },
        ]
      : []),
    {
      title: 'Thao tác',
      key: 'actions',
      fixed: 'right',
      render: (_, item) => (
        <Button
          type={isPendingTab ? 'primary' : 'default'}
          icon={<EyeOutlined />}
          onClick={() => openDetail(item.id)}
        >
          {isPendingTab ? 'Xem & duyệt' : 'Xem chi tiết'}
        </Button>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Duyệt tin đăng"
        description="Tin mới hoặc vừa sửa chỉ hiển thị công khai sau khi Admin duyệt (FE-03, GB-08)."
        breadcrumb={[adminHomeCrumb, { title: 'Duyệt tin đăng' }]}
      />

      <StatusTabs
        domain="toy"
        showAll={false}
        statuses={queueStatusTabs}
        value={status}
        counts={counts.data}
        onChange={(next) => setFilter('status', next === 'pending' ? undefined : next)}
      />

      <FilterBar>
        <div className="w-80">
          <Input.Search
            key={q ?? ''}
            defaultValue={q}
            allowClear
            placeholder="Tìm theo tên, mô tả hoặc mã tin"
            onSearch={(value) => setFilter('q', value.trim() || undefined)}
          />
        </div>
        <Select<ListingType>
          allowClear
          placeholder="Loại tin"
          className="w-40"
          value={listingType}
          options={toOptions(listingTypeLabels)}
          onChange={(value) => setFilter('listingType', value)}
        />
        <Select<string>
          allowClear
          showSearch={{ optionFilterProp: 'label' }}
          placeholder="Danh mục"
          className="w-60"
          loading={categories.isLoading}
          value={categoryId}
          options={(categories.data ?? []).map((category) => ({
            value: category.id,
            label: category.status === 'hidden' ? `${category.name} (đã ẩn)` : category.name,
          }))}
          onChange={(value) => setFilter('categoryId', value)}
        />
      </FilterBar>

      <DataTable<ToyModerationListItem>
        items={queue.data?.items}
        pagination={queue.data?.pagination}
        error={queue.error}
        onRetry={() => void queue.refetch()}
        loading={queue.isFetching}
        columns={columns}
        onPageChange={setPage}
        onRowOpen={(item) => openDetail(item.id)}
        locale={{
          emptyText: isPendingTab ? 'Không có tin nào đang chờ duyệt.' : 'Không có tin nào.',
        }}
      />
    </>
  )
}
