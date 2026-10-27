import { Card, Empty, Timeline, Typography } from 'antd'

import { StatusTag } from '../../../components/common'
import { getStatusStyle, toneColors } from '../../../styles/status'
import { formatDateTime } from '../../../utils/format'
import type { IdentityVerificationDetail } from '../types'

interface PreviousAttemptsTimelineProps {
  verification: IdentityVerificationDetail
}

// Earlier requests of the same user, newest first, so the Admin sees why they were rejected.
export function PreviousAttemptsTimeline({ verification }: PreviousAttemptsTimelineProps) {
  const attempts = verification.previousRequests
  return (
    <Card title={`Các lần gửi trước (${attempts.length})`}>
      {attempts.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Đây là lần gửi đầu tiên" />
      ) : (
        <Timeline
          items={attempts.map((attempt) => ({
            key: attempt.id,
            color: toneColors[getStatusStyle('identity', attempt.status).tone],
            title: formatDateTime(attempt.submittedAt),
            content: (
              <div className="flex flex-col items-start gap-1">
                <StatusTag domain="identity" status={attempt.status} />
                {attempt.rejectionReason && (
                  <Typography.Text type="secondary">Lý do: {attempt.rejectionReason}</Typography.Text>
                )}
              </div>
            ),
          }))}
        />
      )}
    </Card>
  )
}
