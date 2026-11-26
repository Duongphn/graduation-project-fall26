import { PlusOutlined, TeamOutlined } from '@ant-design/icons'
import { Badge, Button, Input, Space, Tag, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

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
import { adminHomeCrumb, adminPaths } from '../../../routes/paths'
import { palette } from '../../../styles/palette'
import { useAdminCategoryOptions } from '../../categories/hooks'
import { ageGroupLabel } from '../constants'
import { OrganizationDetails } from '../components/OrganizationDetails'
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
  const categories = useAdminCategoryOptions()
  const categoryNames = useMemo(
    () => new Map((categories.data ?? []).map((category) => [category.id, category.name])),
    [categories.data],
  )

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
      title: 'Điểm nhận',
      key: 'receivingPoint',
      render: (_, organization) =>
        organization.receivingPoint ? (
          <Space orientation="vertical" size={0}>
            <Typography.Text>{organization.receivingPoint.province}</Typography.Text>
            <Typography.Text type="secondary">{organization.receivingPoint.openingHours}</Typography.Text>
          </Space>
        ) : (
          <Typography.Text type="warning">Chưa có điểm nhận</Typography.Text>
        ),
    },
    {
      title: 'Nhu cầu',
      key: 'needs',
      render: (_, organization) => (
        <Space size={[0, 4]} wrap>
          {organization.isAccepting ? <Tag color="green">Đang nhận</Tag> : <Tag>Tạm ngừng</Tag>}
          {organization.isRemoteArea && <Tag color="purple">Vùng khó khăn</Tag>}
          {organization.ageGroups.map((group) => (
            <Tag key={`${group.minAge}`}>{ageGroupLabel(group)}</Tag>
          ))}
        </Space>
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
      title: 'Yêu cầu đang mở / tổng',
      key: 'openRequestCount',
      align: 'center',
      // R03 III.7.5.1: open requests and the total; opens them in the Donation List.
      render: (_, organization) => (
        <Link
          to={`${adminPaths.donationRequests}?organizationId=${organization.id}`}
          aria-label={`Xem yêu cầu của ${organization.name}`}
        >
          <Space size={4}>
            <Badge
              count={organization.openRequestCount}
              showZero
              color={organization.openRequestCount > 0 ? palette.warning : palette.textMuted}
            />
            <Typography.Text type="secondary">/ {organization.requestCount}</Typography.Text>
          </Space>
        </Link>
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
        expandable={{
          expandedRowRender: (organization) => (
            <OrganizationDetails organization={organization} categoryNames={categoryNames} />
          ),
        }}
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
