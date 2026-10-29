import { UserOutlined } from '@ant-design/icons'
import { Avatar, Typography } from 'antd'

import type { IdentityStatus, UserStatus } from '../../constants/domain'
import { StatusTag } from './StatusTag'

export interface UserSummaryData {
  id?: string
  fullName: string
  // Masked by the backend on Admin screens (GB-35).
  phone?: string | null
  email?: string | null
  identityStatus?: IdentityStatus
  accountStatus?: UserStatus
}

interface UserSummaryProps {
  // Null when the account no longer exists.
  user: UserSummaryData | null
  // `cell`: compact, for a table column. `card`: avatar and copyable id, for a detail card.
  variant?: 'cell' | 'card'
}

const MISSING_USER_TEXT = 'Không tìm thấy tài khoản'

// Who a row or card is about: name, masked contacts and the identity/account status tags.
// The one place that renders a user summary, so labels and the empty state stay the same.
export function UserSummary({ user, variant = 'cell' }: UserSummaryProps) {
  if (!user) return <Typography.Text type="secondary">{MISSING_USER_TEXT}</Typography.Text>

  const tags = (user.identityStatus || user.accountStatus) && (
    <div className="flex flex-wrap gap-1">
      {user.identityStatus && <StatusTag domain="identity" status={user.identityStatus} />}
      {user.accountStatus && <StatusTag domain="user" status={user.accountStatus} />}
    </div>
  )
  const details = (
    <div className="flex flex-col gap-1">
      <Typography.Text strong>{user.fullName}</Typography.Text>
      {user.phone && (
        <Typography.Text type="secondary" className="text-xs">
          {user.phone}
        </Typography.Text>
      )}
      {user.email && (
        <Typography.Text type="secondary" className="text-xs">
          {user.email}
        </Typography.Text>
      )}
      {variant === 'card' && user.id && (
        <Typography.Text type="secondary" className="text-xs" copyable={{ text: user.id }}>
          Mã: {user.id}
        </Typography.Text>
      )}
      {tags}
    </div>
  )

  if (variant === 'cell') return details
  return (
    <div className="flex items-start gap-3">
      <Avatar size={48} icon={<UserOutlined />} />
      {details}
    </div>
  )
}
