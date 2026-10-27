import { PlusOutlined } from '@ant-design/icons'
import { Button, Input, Select, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { useState } from 'react'

import { DataTable, FilterBar, PageHeader, StatusTag } from '../../../components/common'
import type { VisibilityStatus } from '../../../constants/domain'
import { useListParams } from '../../../hooks/useListParams'
import { adminHomeCrumb } from '../../../routes/paths'
import { statusOptions } from '../../../styles/status'
import { CategoryFormModal } from '../components/CategoryFormModal'
import { CategoryOrderControl } from '../components/CategoryOrderControl'
import { CategoryRowActions } from '../components/CategoryRowActions'
import { useAdminCategories, useReorderCategories } from '../hooks'
import { categoryFiltersSchema } from '../schemas'
import type { AdminCategory } from '../types'

const FILTERED_ORDER_HINT = 'Bỏ bộ lọc để sắp xếp thứ tự'
const PAGED_ORDER_HINT = 'Chỉ sắp xếp được khi mọi danh mục nằm trên một trang'
// The backend maximum: one page normally holds every category.
const PAGE_SIZE = 100

// UC30 (categories): add, edit, hide/show, delete unused ones and reorder toy categories.
export function CategoriesPage() {
  const { params, filters, setFilter, setPage } = useListParams({
    schema: categoryFiltersSchema,
    defaultLimit: PAGE_SIZE,
  })
  const { status, q } = filters

  const categoriesQuery = useAdminCategories(params)
  const reorderMutation = useReorderCategories()
  // `opening` remounts the form for each opening; the category stays set while it closes.
  const [form, setForm] = useState<{ open: boolean; opening: number; category?: AdminCategory }>({
    open: false,
    opening: 0,
  })
  const openForm = (category?: AdminCategory) =>
    setForm((current) => ({ open: true, opening: current.opening + 1, category }))

  const items = categoriesQuery.data?.items ?? []
  const pagination = categoriesQuery.data?.pagination
  // Moving swaps neighbours in the whole list, so it needs the complete, up-to-date list.
  const orderBlockedReason =
    status || q
      ? FILTERED_ORDER_HINT
      : pagination && pagination.totalPages > 1
        ? PAGED_ORDER_HINT
        : undefined
  const orderBusy = reorderMutation.isPending || categoriesQuery.isFetching

  const move = (index: number, offset: -1 | 1) => {
    const ids = items.map((item) => item.id)
    const [moved] = ids.splice(index, 1)
    if (!moved) return
    ids.splice(index + offset, 0, moved)
    reorderMutation.mutate(ids)
  }

  const columns: TableColumnsType<AdminCategory> = [
    {
      title: 'Thứ tự',
      key: 'order',
      width: 110,
      render: (_, category, index) => (
        <CategoryOrderControl
          displayOrder={category.displayOrder}
          isFirst={index === 0}
          isLast={index === items.length - 1}
          disabledReason={orderBlockedReason}
          busy={orderBusy}
          onMove={(offset) => move(index, offset)}
        />
      ),
    },
    {
      title: 'Tên danh mục',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      render: (name: string) => <Typography.Text strong>{name}</Typography.Text>,
    },
    {
      title: 'Slug',
      dataIndex: 'slug',
      key: 'slug',
      render: (slug: string) => <Typography.Text code>{slug}</Typography.Text>,
    },
    {
      title: 'Mô tả',
      dataIndex: 'description',
      key: 'description',
      width: 220,
      render: (description?: string) =>
        description ? (
          <div className="max-w-52">
            <Typography.Paragraph className="!mb-0" ellipsis={{ rows: 2, tooltip: description }}>
              {description}
            </Typography.Paragraph>
          </div>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (value: VisibilityStatus) => <StatusTag domain="visibility" status={value} />,
    },
    {
      title: 'Số đồ chơi',
      dataIndex: 'toyCount',
      key: 'toyCount',
      width: 100,
      align: 'right',
    },
    {
      title: 'Thao tác',
      key: 'actions',
      fixed: 'right',
      render: (_, category) => <CategoryRowActions category={category} onEdit={openForm} />,
    },
  ]

  return (
    <>
      <PageHeader
        title="Danh mục đồ chơi"
        description="Danh mục dùng khi đăng tin và tìm kiếm. Danh mục đang có đồ chơi chỉ có thể ẩn, không thể xoá."
        breadcrumb={[adminHomeCrumb, { title: 'Danh mục đồ chơi' }]}
        actions={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm()}>
            Thêm danh mục
          </Button>
        }
      />

      <FilterBar
        extra={
          <Typography.Text type="secondary">
            {pagination ? `${pagination.totalItems} danh mục` : null}
          </Typography.Text>
        }
      >
        <div className="w-72">
          <Input.Search
            key={q ?? ''}
            allowClear
            defaultValue={q}
            placeholder="Tìm theo tên hoặc mô tả"
            onSearch={(value) => setFilter('q', value.trim() || undefined)}
          />
        </div>
        <Select<VisibilityStatus>
          className="w-48"
          allowClear
          placeholder="Tất cả trạng thái"
          value={status}
          options={statusOptions('visibility')}
          onChange={(value) => setFilter('status', value)}
        />
      </FilterBar>

      <DataTable<AdminCategory>
        items={categoriesQuery.data?.items}
        pagination={pagination && pagination.totalPages > 1 ? pagination : undefined}
        error={categoriesQuery.error}
        onRetry={() => void categoriesQuery.refetch()}
        loading={categoriesQuery.isFetching}
        columns={columns}
        onPageChange={setPage}
      />

      <CategoryFormModal
        key={form.opening}
        open={form.open}
        category={form.category}
        onClose={() => setForm((current) => ({ ...current, open: false }))}
      />
    </>
  )
}
