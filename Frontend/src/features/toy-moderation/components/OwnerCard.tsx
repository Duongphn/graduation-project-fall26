import { Card, Descriptions } from 'antd'
import type { DescriptionsProps } from 'antd'

import { AgeTag, StatusTag, UserSummary } from '../../../components/common'
import { formatDate, formatDateTime } from '../../../utils/format'
import type { ToyModerationDetail } from '../types'

interface OwnerCardProps {
  owner: ToyModerationDetail['owner']
  // GB-07 minimum age sent by the backend.
  minAgeYears: number
}

// Who posted the toy: identity check, age (GB-07), account status and trust score.
export function OwnerCard({ owner, minAgeYears }: OwnerCardProps) {
  if (!owner) {
    return (
      <Card title="Người đăng">
        <UserSummary user={null} />
      </Card>
    )
  }

  const items: DescriptionsProps['items'] = [
    {
      key: 'identity',
      label: 'Xác minh danh tính',
      children: <StatusTag domain="identity" status={owner.identityStatus} />,
    },
    {
      key: 'account',
      label: 'Tài khoản',
      children: (
        <span className="inline-flex flex-wrap items-center gap-2">
          <StatusTag domain="user" status={owner.accountStatus} />
          {owner.lockedUntil && `đến ${formatDateTime(owner.lockedUntil)}`}
        </span>
      ),
    },
    { key: 'age', label: 'Tuổi', children: <AgeTag age={owner.age} minAgeYears={minAgeYears} /> },
    {
      key: 'trust',
      label: 'Điểm uy tín',
      children:
        owner.trustScore === null
          ? 'Chưa có đánh giá'
          : `${owner.trustScore.toFixed(1)} (${owner.ratingCount} đánh giá)`,
    },
    { key: 'joined', label: 'Ngày tham gia', children: formatDate(owner.memberSince) },
  ]

  return (
    <Card title="Người đăng">
      <div className="mb-4">
        <UserSummary
          variant="card"
          user={{ id: owner.id, fullName: owner.fullName, phone: owner.maskedPhone }}
        />
      </div>
      <Descriptions size="small" column={1} items={items} />
    </Card>
  )
}
