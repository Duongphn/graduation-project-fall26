import { Card, Timeline, Typography } from 'antd'

import { ImageGallery, RelativeTime, StatusTag } from '../../../components/common'
import { actorTypeLabels, handoverStepLabels } from '../../../constants/labels'
import type { DonationRequestDetail } from '../types'

type HistoryEntry = DonationRequestDetail['history'][number]

/**
 * GB-19, R03 III.5.2.2 (2): who made each change, by role (and name for a user): Người tặng,
 * Người nhận, Quản trị viên (for an organization) or Hệ thống (expiry job).
 */
const historyActorLabel = (request: DonationRequestDetail, entry: HistoryEntry): string => {
  if (entry.actorType !== 'USER') return actorTypeLabels[entry.actorType]
  const withName = (role: string, name: string | undefined) => (name ? `${role} · ${name}` : role)
  if (entry.actorId && entry.actorId === request.donor?.id) return withName('Người tặng', request.donor.fullName)
  if (entry.actorId && entry.actorId === request.requester?.id) {
    return withName('Người nhận', request.requester.fullName)
  }
  return actorTypeLabels.USER
}

// Status history (order_status_history) and handover photos of one request.
export function DonationTimeline({ request }: { request: DonationRequestDetail }) {
  return (
    <div className="flex flex-col gap-4">
      <Card title="Lịch sử trạng thái" size="small">
        <Timeline
          items={request.history.map((entry, index) => ({
            key: `${entry.at}-${index}`,
            content: (
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusTag domain="donation" status={entry.toStatus} />
                  <Typography.Text type="secondary">
                    {historyActorLabel(request, entry)}
                  </Typography.Text>
                </div>
                {entry.reason && <Typography.Text>{entry.reason}</Typography.Text>}
                <RelativeTime value={entry.at} />
              </div>
            ),
          }))}
        />
      </Card>
      {request.handovers.length > 0 && (
        <Card title="Bàn giao" size="small">
          <div className="flex flex-col gap-4">
            {request.handovers.map((handover) => (
              <div key={`${handover.step}-${handover.at}`} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Typography.Text strong>{handoverStepLabels[handover.step]}</Typography.Text>
                  <RelativeTime value={handover.at} />
                </div>
                {handover.note && <Typography.Text>{handover.note}</Typography.Text>}
                <ImageGallery
                  images={handover.photos.map((url, index) => ({ url, key: String(index) }))}
                />
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
