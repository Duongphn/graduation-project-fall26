import { Card, Descriptions, Skeleton } from 'antd'
import { useParams } from 'react-router-dom'

import { PageHeader, QueryErrorAlert, StatusTag } from '../../../components/common'
import { adminHomeCrumb, adminPaths } from '../../../routes/paths'
import { formatDate, formatDateTime } from '../../../utils/format'
import { AccountEnforcementCard } from '../components/AccountEnforcementCard'
import { AccountViolationHistory } from '../components/AccountViolationHistory'
import { TrustBlockCard } from '../components/TrustBlockCard'
import { useAccount } from '../hooks'

// UC29, R03 III.7.2.1 (4)-(10): read-only profile, metrics, violation history and the lock or
// unlock form; screen 47: the Trust Score block of a Renter and its review (FE-09).
export function AccountDetailPage() {
  const { id } = useParams<{ id: string }>()
  const detail = useAccount(id)
  const account = detail.data

  return (
    <>
      <PageHeader
        title={account?.fullName ?? 'Tài khoản'}
        breadcrumb={[
          adminHomeCrumb,
          { title: 'Quản lý người dùng', to: adminPaths.users },
          { title: 'Chi tiết tài khoản' },
        ]}
        actions={account && <StatusTag domain="user" status={account.accountStatus} />}
      />
      {detail.error ? (
        <QueryErrorAlert error={detail.error} onRetry={() => void detail.refetch()} />
      ) : !account ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-4 lg:col-span-2">
            <Card title="Hồ sơ">
              <Descriptions
                column={{ xs: 1, md: 2 }}
                items={[
                  { key: 'name', label: 'Họ tên', children: account.fullName },
                  { key: 'phone', label: 'Số điện thoại', children: account.phone },
                  { key: 'email', label: 'Email', children: account.email },
                  { key: 'joined', label: 'Ngày tham gia', children: formatDate(account.createdAt) },
                  {
                    key: 'lastLogin',
                    label: 'Đăng nhập gần nhất',
                    children: account.lastLoginAt ? formatDateTime(account.lastLoginAt) : 'Chưa ghi nhận',
                  },
                  {
                    key: 'identity',
                    label: 'Xác minh danh tính',
                    children: <StatusTag domain="identity" status={account.verificationStatus} />,
                  },
                ]}
              />
            </Card>
            <Card title="Chỉ số hoạt động">
              <Descriptions
                column={{ xs: 1, md: 2 }}
                items={[
                  { key: 'trust', label: 'Điểm tin cậy', children: account.trustScore ?? '—' },
                  {
                    key: 'rating',
                    label: 'Đánh giá trung bình',
                    // Ratings (UC24) are not built yet.
                    children:
                      account.averageRating === null ? 'Chưa có' : `${account.averageRating.toFixed(1)} / 5`,
                  },
                  { key: 'bookings', label: 'Đơn thuê hoàn tất', children: account.completedBookingCount },
                  { key: 'violations', label: 'Số vi phạm', children: account.violationCount },
                  { key: 'pending', label: 'Báo cáo chờ xử lý', children: account.pendingReportCount },
                  { key: 'listings', label: 'Tin đang hiển thị', children: account.activeListingCount },
                ]}
              />
            </Card>
            {account.lock && (
              <Card title="Đang bị khóa">
                <Descriptions
                  column={1}
                  items={[
                    { key: 'reason', label: 'Lý do', children: account.lock.reason ?? '—' },
                    {
                      key: 'until',
                      label: 'Thời hạn',
                      children: account.lock.until ? `Đến ${formatDateTime(account.lock.until)}` : 'Vĩnh viễn',
                    },
                    { key: 'at', label: 'Khóa lúc', children: formatDateTime(account.lock.lockedAt) },
                    { key: 'by', label: 'Người khóa', children: account.lock.lockedBy?.fullName ?? '—' },
                    { key: 'hidden', label: 'Tin bị ẩn khi khóa', children: account.lock.hiddenListingCount },
                  ]}
                />
              </Card>
            )}
            <Card title="Lịch sử vi phạm">
              <AccountViolationHistory violations={account.violations} />
            </Card>
          </div>
          <div className="flex flex-col gap-4">
            <TrustBlockCard account={account} />
            <AccountEnforcementCard key={account.accountStatus} account={account} />
          </div>
        </div>
      )}
    </>
  )
}
