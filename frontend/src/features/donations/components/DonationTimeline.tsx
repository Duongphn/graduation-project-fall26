import { Card, Timeline, Typography } from 'antd'

import { ImageGallery, RelativeTime, StatusTag } from '../../../components/common'
import { actorTypeLabels, handoverStepLabels } from '../../../constants/labels'
import type { DonationRequestDetail } from '../types'

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
                    {actorTypeLabels[entry.actorType]}
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
