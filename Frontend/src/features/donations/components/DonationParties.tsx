import { Card, Descriptions, Typography } from 'antd'

import { StatusTag, Thumbnail, UserSummary } from '../../../components/common'
import {
  ageGroupLabels,
  donationReceiverTypeLabels,
  toyConditionLabels,
} from '../../../constants/labels'
import type { DonationRequestDetail } from '../types'

// The toy, the donor and the receiver (user or organization) of one request.
export function DonationParties({ request }: { request: DonationRequestDetail }) {
  const { toy, organization } = request
  return (
    <div className="flex flex-col gap-4">
      <Card title="Đồ chơi" size="small">
        {toy ? (
          <div className="flex flex-col gap-3">
            <Thumbnail src={toy.imageUrl} alt={toy.title} size={72} caption={toy.title} />
            <Descriptions size="small" column={1}>
              <Descriptions.Item label="Tình trạng">
                {toyConditionLabels[toy.condition]}
              </Descriptions.Item>
              <Descriptions.Item label="Độ tuổi">{ageGroupLabels[toy.ageGroup]}</Descriptions.Item>
              <Descriptions.Item label="Trạng thái tin">
                <StatusTag domain="toy" status={toy.status} />
              </Descriptions.Item>
            </Descriptions>
          </div>
        ) : (
          <Typography.Text type="secondary">Đồ chơi không còn tồn tại.</Typography.Text>
        )}
      </Card>
      <Card title="Các bên" size="small">
        <Descriptions size="small" column={1}>
          <Descriptions.Item label="Người tặng">
            <UserSummary user={request.donor} />
          </Descriptions.Item>
          <Descriptions.Item label="Loại bên nhận">
            {donationReceiverTypeLabels[request.receiverType]}
          </Descriptions.Item>
          {organization && (
            <Descriptions.Item label="Tổ chức">
              <div className="flex flex-col">
                <span className="flex items-center gap-2">
                  <Typography.Text strong>{organization.name}</Typography.Text>
                  <StatusTag domain="visibility" status={organization.status} />
                </span>
                {organization.address && (
                  <Typography.Text type="secondary">{organization.address}</Typography.Text>
                )}
                {organization.contactInfo && (
                  <Typography.Text type="secondary">{organization.contactInfo}</Typography.Text>
                )}
                {organization.phone && (
                  <Typography.Text type="secondary">{organization.phone}</Typography.Text>
                )}
              </div>
            </Descriptions.Item>
          )}
          <Descriptions.Item label={organization ? 'Người gửi yêu cầu' : 'Người nhận'}>
            <UserSummary user={request.requester} />
          </Descriptions.Item>
          {request.message && (
            <Descriptions.Item label="Lời nhắn">{request.message}</Descriptions.Item>
          )}
          {request.rejectReason && (
            <Descriptions.Item label="Lý do từ chối">{request.rejectReason}</Descriptions.Item>
          )}
          {request.cancellation?.note && (
            <Descriptions.Item label="Lý do huỷ">{request.cancellation.note}</Descriptions.Item>
          )}
        </Descriptions>
      </Card>
    </div>
  )
}
