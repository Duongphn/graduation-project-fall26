import { Card, Descriptions } from 'antd'
import type { DescriptionsProps } from 'antd'

import { RelativeTime, StatusTag } from '../../../components/common'
import { formatDateTime } from '../../../utils/format'
import type { ToyModerationDetail } from '../types'

// Moderation state of the post: status, submission, who decided and why.
export function ModerationStatusCard({ toy }: { toy: ToyModerationDetail }) {
  const { moderation } = toy
  const items: DescriptionsProps['items'] = [
    {
      key: 'status',
      label: 'Trạng thái',
      children: <StatusTag domain="toy" status={toy.status} />,
    },
    {
      key: 'submitted',
      label: 'Gửi duyệt',
      children: <RelativeTime value={moderation.submittedAt} />,
    },
  ]

  if (moderation.reviewedBy) {
    items.push(
      {
        key: 'reviewer',
        label: 'Người duyệt',
        children: moderation.reviewedBy.fullName ?? moderation.reviewedBy.id,
      },
      { key: 'reviewed', label: 'Quyết định lúc', children: formatDateTime(moderation.reviewedAt) },
    )
  }
  if (moderation.rejectReason) {
    items.push({ key: 'reason', label: 'Lý do từ chối', children: moderation.rejectReason })
  }

  return (
    <Card title="Kiểm duyệt">
      <Descriptions size="small" column={1} items={items} />
    </Card>
  )
}
