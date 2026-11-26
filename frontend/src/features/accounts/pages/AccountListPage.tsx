import { EyeOutlined, UserOutlined } from '@ant-design/icons'
import { Avatar, Badge, Button, Input, Select, Tabs, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { Link, useNavigate } from 'react-router-dom'

import { DataTable, FilterBar, PageHeader, StatusTag } from '../../../components/common'
import type { UserRole } from '../../../constants/domain'
import { useListParams } from '../../../hooks/useListParams'
import { adminHomeCrumb, adminPaths } from '../../../routes/paths'
import { palette } from '../../../styles/palette'
import { formatDate, formatDateTime } from '../../../utils/format'
import { TrustBlockTag } from '../components/TrustBlockTag'
import { useAccountCounts, useAccounts } from '../hooks'
import { accountFiltersSchema, accountSortFields } from '../schemas'
import {
  accountTabs,
  accountTrustBands,
  type AccountListItem,
  type AccountTab,
  type AccountTrustBand,
} from '../types'

const tabLabels: Record<AccountTab, string> = {
  all: 'Tất cả',
  active: 'Hoạt động',
  locked: 'Đã khoá',
  reported: 'Có báo cáo mới',
  trust_review: 'Bị chặn do Trust Score',
}

const roleLabels: Record<UserRole, string> = { USER: 'Người dùng', ADMIN: 'Quản trị viên' }

// GB-29: the score goes from 0 to 100 and starts at 100; below 50 blocks high-deposit rentals.
const trustBandLabels: Record<AccountTrustBand, string> = {
  low: 'Dưới 50 (hạn chế thuê)',
  medium: 'Từ 50 đến 99',
  full: '100 (điểm tối đa)',
}

// UC29, R03 III.7.2.1: every account with its status, Trust Score and violation count.
export function AccountListPage() {
  const navigate = useNavigate()
  const { params, filters, sortBy, setPage, setFilter, setSort } = useListParams({
    schema: accountFiltersSchema,
    sortFields: accountSortFields,
  })
  const accounts = useAccounts(params)
  const counts = useAccountCounts({
    ...(filters.role ? { role: filters.role } : {}),
    ...(filters.trustBand ? { trustBand: filters.trustBand } : {}),
    ...(filters.q ? { q: filters.q } : {}),
  })

  const columns: TableColumnsType<AccountListItem> = [
    {
      title: 'Người dùng',
      key: 'user',
      render: (_, item) => (
        <div className="flex items-center gap-3">
          <Avatar src={item.avatar ?? undefined} icon={<UserOutlined />} />
          <div className="flex flex-col">
            <Link to={adminPaths.user(item.id)} className="font-medium">
              {item.fullName}
            </Link>
            <Typography.Text type="secondary" className="text-xs">
              {item.maskedPhone} · {item.maskedEmail}
            </Typography.Text>
          </div>
        </div>
      ),
    },
    { title: 'Vai trò', key: 'role', render: (_, item) => roleLabels[item.role] },
    {
      title: 'Điểm tin cậy',
      key: 'trustScore',
      render: (_, item) => (
        <div className="flex flex-col items-start gap-1">
          <span>{item.trustScore ?? '—'}</span>
          {item.trustBlockStatus && <TrustBlockTag status={item.trustBlockStatus} />}
        </div>
      ),
    },
    {
      title: 'Vi phạm',
      key: 'violationCount',
      render: (_, item) => (
        <div className="flex items-center gap-2">
          <span>{item.violationCount}</span>
          {item.pendingReportCount > 0 && (
            <Badge
              count={item.pendingReportCount}
              color={palette.warning}
              title={`${item.pendingReportCount} báo cáo chờ xử lý`}
            />
          )}
        </div>
      ),
    },
    { title: 'Ngày tham gia', key: 'createdAt', render: (_, item) => formatDate(item.createdAt) },
    {
      title: 'Trạng thái',
      key: 'status',
      render: (_, item) => (
        <div className="flex flex-col items-start gap-1">
          <StatusTag domain="user" status={item.accountStatus} />
          {item.lockedUntil && (
            <Typography.Text type="secondary" className="text-xs">
              đến {formatDateTime(item.lockedUntil)}
            </Typography.Text>
          )}
        </div>
      ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      fixed: 'right',
      render: (_, item) => (
        <Button icon={<EyeOutlined />} onClick={() => navigate(adminPaths.user(item.id))}>
          {item.role === 'ADMIN'
            ? 'Xem chi tiết'
            : item.trustBlockStatus === 'review'
              ? 'Xem xét'
              : item.accountStatus === 'LOCKED'
                ? 'Mở khóa'
                : 'Khóa'}
        </Button>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Quản lý người dùng"
        description="Khóa hoặc mở khóa tài khoản và xem xét Renter bị chặn do Trust Score, luôn kèm lý do (UC29). Số điện thoại và email được che một phần."
        breadcrumb={[adminHomeCrumb, { title: 'Quản lý người dùng' }]}
      />

      <Tabs
        activeKey={filters.tab}
        onChange={(key) => setFilter('tab', key === 'all' ? undefined : key)}
        items={accountTabs.map((tab) => ({
          key: tab,
          label: (
            <span className="flex items-center gap-2">
              {tabLabels[tab]}
              {counts.data && (
                <Badge
                  count={counts.data[tab]}
                  showZero
                  overflowCount={9999}
                  // Renters waiting for a Trust Score decision stand out (UC29, FE-09).
                  color={tab === 'trust_review' && counts.data[tab] > 0 ? palette.warning : palette.textMuted}
                />
              )}
            </span>
          ),
        }))}
      />

      <FilterBar>
        <div className="w-80">
          <Input.Search
            key={filters.q ?? ''}
            defaultValue={filters.q}
            allowClear
            placeholder="Tìm theo tên, số điện thoại hoặc email"
            onSearch={(value) => setFilter('q', value.trim() || undefined)}
          />
        </div>
        <Select<UserRole>
          allowClear
          placeholder="Vai trò"
          aria-label="Vai trò"
          className="w-40"
          value={filters.role}
          options={(['USER', 'ADMIN'] as const).map((role) => ({ value: role, label: roleLabels[role] }))}
          onChange={(value) => setFilter('role', value)}
        />
        <Select<AccountTrustBand>
          allowClear
          placeholder="Điểm tin cậy"
          aria-label="Điểm tin cậy"
          className="w-52"
          value={filters.trustBand}
          options={accountTrustBands.map((band) => ({ value: band, label: trustBandLabels[band] }))}
          onChange={(value) => setFilter('trustBand', value)}
        />
        <Select<'createdAt' | 'violationCount'>
          aria-label="Sắp xếp"
          className="w-52"
          value={sortBy ?? 'createdAt'}
          options={[
            { value: 'createdAt', label: 'Mới tham gia trước' },
            { value: 'violationCount', label: 'Nhiều vi phạm trước' },
          ]}
          onChange={(value) => setSort(value === 'createdAt' ? undefined : value, 'desc')}
        />
      </FilterBar>

      <DataTable<AccountListItem>
        items={accounts.data?.items}
        pagination={accounts.data?.pagination}
        error={accounts.error}
        onRetry={() => void accounts.refetch()}
        loading={accounts.isFetching}
        columns={columns}
        onPageChange={setPage}
        onRowOpen={(item) => navigate(adminPaths.user(item.id))}
        scroll={{ x: 900 }}
        locale={{ emptyText: 'Không có tài khoản nào.' }}
      />
    </>
  )
}
