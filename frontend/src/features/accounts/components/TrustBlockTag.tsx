import { Tag } from 'antd'

import { toneColors } from '../../../styles/status'
import type { TrustBlockStatus } from '../types'

const trustBlockStatusLabels: Record<TrustBlockStatus, string> = {
  review: 'Chờ xem xét Trust Score',
  lifted: 'Đã gỡ chặn Trust Score',
}

// State of the Trust Score block (UC29, FE-09): waiting for an Admin, or lifted by one.
export function TrustBlockTag({ status }: { status: TrustBlockStatus }) {
  return (
    <Tag color={status === 'review' ? toneColors.warning : toneColors.success} className="m-0">
      {trustBlockStatusLabels[status]}
    </Tag>
  )
}
