import { Card, Descriptions } from 'antd'

import { StatusTag, UserSummary } from '../../../components/common'
import { formatDate, formatDateTime } from '../../../utils/format'
import type { IdentityVerificationDetail } from '../types'

interface IdentityUserCardProps {
  verification: IdentityVerificationDetail
}

// Account data the Admin compares with the citizen ID card (name, date of birth, age).
export function IdentityUserCard({ verification }: IdentityUserCardProps) {
  const { user } = verification
  if (!user) {
    return (
      <Card title="Thông tin người dùng">
        <UserSummary user={null} />
      </Card>
    )
  }

  return (
    <Card title="Thông tin người dùng">
      <div className="mb-4">
        <UserSummary
          variant="card"
          user={{ id: user.id, fullName: user.fullName, phone: user.maskedPhone, email: user.maskedEmail }}
        />
      </div>
      <Descriptions
        column={1}
        size="small"
        items={[
          { key: 'phone', label: 'Số điện thoại', children: verification.phone },
          { key: 'idCard', label: 'Số CCCD', children: verification.idCardNumber },
          {
            key: 'identity',
            label: 'Xác minh danh tính',
            children: <StatusTag domain="identity" status={user.verificationStatus} />,
          },
          {
            key: 'account',
            label: 'Tài khoản',
            children: <StatusTag domain="user" status={user.locked ? 'LOCKED' : user.accountStatus} />,
          },
          { key: 'joined', label: 'Ngày tham gia', children: formatDate(user.joinedAt) },
          { key: 'submitted', label: 'Gửi yêu cầu lúc', children: formatDateTime(verification.submittedAt) },
        ]}
      />
    </Card>
  )
}
