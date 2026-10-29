import { PlusOutlined, TeamOutlined } from '@ant-design/icons'
import { Badge, Button, Input, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { useState } from 'react'

import {
  DataTable,
  FilterBar,
  PageHeader,
  StatusTabs,
  StatusTag,
  Thumbnail,
} from '../../../components/common'
import type { VisibilityStatus } from '../../../constants/domain'
import { useListParams } from '../../../hooks/useListParams'
import { adminHomeCrumb } from '../../../routes/paths'
import { palette } from '../../../styles/palette'
import { OrganizationFormModal } from '../components/OrganizationFormModal'
import { OrganizationRowActions } from '../components/OrganizationRowActions'
import { useOrganizations } from '../hooks'
import { organizationFiltersSchema } from '../schemas'
import type { Organization } from '../types'

// The form is closed, creating, or editing one organization.
type FormState = { open: false } | { open: true; organizationId?: string }

// /admin/organizations: charity organizations that can receive donated toys (FE-02, UC34).
export function OrganizationsPage() {
  const { params, filters, setPage, setFilter } = useListParams({
    schema: organizationFiltersSchema,
  })
  const { data, isFetching, error, refetch } = useOrganizations(params)
  const [form, setForm] = useState<FormState>({ open: false })

  const columns: TableColumnsType<Organization> = [
    {
      title: 'Tổ chức',
      key: 'name',
      width: 320,
      render: (_, organization) => (
        <Thumbnail
          src={null}
          alt={organization.name}
          placeholder={<TeamOutlined />}
          caption={organization.name}
          description={organization.address}
        />
      ),
    },
    {
      title: 'Liên hệ',
      key: 'contact',
      render: (_, organization) => (
        <Typography.Text>{organization.contactInfo}</Typography.Text>
      ),
    },
    {
      title: 'Yêu cầu đang chạy',
      key: 'openRequestCount',
      align: 'center',
      render: (_, organization) => (
        <Badge
          count={organization.openRequestCount}
          showZero
          color={organization.openRequestCount > 0 ? palette.warning : palette.textMuted}
          title={`${organization.requestCount} yêu cầu từ trước tới nay`}
        />
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      render: (value: VisibilityStatus) => <StatusTag domain="visibility" status={value} />,
    },
    {
      title: 'Thao tác',
      key: 'actions',
      fixed: 'right',
      render: (_, organization) => (
        <OrganizationRowActions
          organization={organization}
          onEdit={(organizationId) => setForm({ open: true, organizationId })}
        />
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Tổ chức từ thiện"
        description="Các tổ chức đã được kiểm tra, có thể nhận đồ chơi quyên góp. Tổ chức đã có yêu cầu quyên góp chỉ có thể ẩn, không xoá."
        breadcrumb={[adminHomeCrumb, { title: 'Tổ chức từ thiện' }]}
        actions={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setForm({ open: true })}>
            Thêm tổ chức
          </Button>
        }
      />

      <StatusTabs
        domain="visibility"
        value={filters.status}
        onChange={(value) => setFilter('status', value)}
      />

      <FilterBar>
        <Input.Search
          key={filters.q ?? ''}
          defaultValue={filters.q}
          allowClear
          placeholder="Tìm theo tên, địa chỉ hoặc liên hệ"
          className="w-72"
          onSearch={(value) => setFilter('q', value.trim() || undefined)}
        />
      </FilterBar>

      <DataTable<Organization>
        columns={columns}
        items={data?.items}
        pagination={data?.pagination}
        loading={isFetching}
        error={error}
        onRetry={() => void refetch()}
        onPageChange={setPage}
      />

      {form.open && (
        <OrganizationFormModal
          open
          organizationId={form.organizationId}
          onClose={() => setForm({ open: false })}
        />
      )}
    </>
  )
}
