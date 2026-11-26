import { Card, Descriptions, Tag, Typography } from 'antd'

import { StatusTag, Thumbnail, UserSummary } from '../../../components/common'
import { donationReceiverTypeLabels } from '../../../constants/labels'
import { formatAgeRange, formatDate, formatDateTime } from '../../../utils/format'
import { donationHandoverMethodLabels, receiptChannelLabels } from '../constants'
import type { DonationRequestDetail } from '../types'

// The toy, the donor and the receiver (user or organization) of one request.
export function DonationParties({ request }: { request: DonationRequestDetail }) {
  const { toy, organization } = request
  const sentAt = request.handovers.find((handover) => handover.step === 'DONOR_SENT')?.at
  return (
    <div className="flex flex-col gap-4">
      <Card title="Đồ chơi" size="small">
        {toy ? (
          <div className="flex flex-col gap-3">
            <Thumbnail src={toy.imageUrl} alt={toy.title} size={72} caption={toy.title} />
            <Descriptions size="small" column={1}>
              <Descriptions.Item label="Tình trạng">
                {toy.condition}
              </Descriptions.Item>
              <Descriptions.Item label="Độ tuổi">{formatAgeRange(toy.ageRange)}</Descriptions.Item>
              <Descriptions.Item label="Trạng thái tin">
                {/* GB-60: Đã quyên góp là trạng thái suy ra khi yêu cầu đã xác nhận nhận hàng */}
                {toy.status === 'donated' ? (
                  <Tag color="green" className="m-0">
                    Đã quyên góp
                  </Tag>
                ) : (
                  <StatusTag domain="toy" status={toy.status} />
                )}
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
                  <StatusTag domain="visibility" status={organization.status === 'hidden' ? 'hidden' : 'active'} />
                </span>
                {organization.address && (
                  <Typography.Text type="secondary">{organization.address}</Typography.Text>
                )}
                {!organization.isAccepting && (
                  <Typography.Text type="warning">Đang tạm ngừng nhận đồ chơi</Typography.Text>
                )}
                {organization.contactInfo && (
                  <Typography.Text type="secondary">{organization.contactInfo}</Typography.Text>
                )}
                {organization.supportCriteria && (
                  <Typography.Text type="secondary">{organization.supportCriteria}</Typography.Text>
                )}
              </div>
            </Descriptions.Item>
          )}
          {organization?.receivingPoint && (
            <Descriptions.Item label="Điểm nhận">
              <div className="flex flex-col">
                <span>
                  {[
                    organization.receivingPoint.street,
                    organization.receivingPoint.ward,
                    organization.receivingPoint.province,
                  ].join(', ')}
                </span>
                <Typography.Text type="secondary">
                  {organization.receivingPoint.openingHours}
                </Typography.Text>
                {organization.receivingPoint.contactName && (
                  <Typography.Text type="secondary">
                    {organization.receivingPoint.contactName} ·{' '}
                    {organization.receivingPoint.contactPhone}
                  </Typography.Text>
                )}
              </div>
            </Descriptions.Item>
          )}
          <Descriptions.Item label={organization ? 'Người gửi yêu cầu' : 'Người nhận'}>
            <UserSummary user={request.requester} />
          </Descriptions.Item>
          {request.status === 'pending' && (
            <Descriptions.Item label="Bên quyết định">
              {request.decider === 'ADMIN'
                ? 'Admin, thay tổ chức (người tặng gửi tới tổ chức)'
                : 'Người tặng'}
            </Descriptions.Item>
          )}
          {request.message && (
            <Descriptions.Item label="Lời nhắn">{request.message}</Descriptions.Item>
          )}
          {request.rejectReason && (
            <Descriptions.Item label="Lý do từ chối">{request.rejectReason}</Descriptions.Item>
          )}
          {request.cancellation?.note && (
            <Descriptions.Item label="Lý do huỷ">{request.cancellation.note}</Descriptions.Item>
          )}
          {request.expiryReason && (
            <Descriptions.Item label="Lý do hết hạn">{request.expiryReason}</Descriptions.Item>
          )}
        </Descriptions>
      </Card>
      {(request.handoverMethod || request.receipt) && (
        <Card title="Bàn giao và nhận" size="small">
          <Descriptions size="small" column={1}>
            {request.handoverMethod && (
              <Descriptions.Item label="Cách bàn giao">
                {donationHandoverMethodLabels[request.handoverMethod]}
              </Descriptions.Item>
            )}
            {request.carrierName && (
              <Descriptions.Item label="Đơn vị vận chuyển">{request.carrierName}</Descriptions.Item>
            )}
            {request.trackingCode && (
              <Descriptions.Item label="Mã vận đơn">{request.trackingCode}</Descriptions.Item>
            )}
            {sentAt && <Descriptions.Item label="Ngày gửi">{formatDateTime(sentAt)}</Descriptions.Item>}
            {request.receipt?.confirmedBy && (
              <Descriptions.Item label="Người xác nhận">{request.receipt.confirmedBy}</Descriptions.Item>
            )}
            {request.receipt?.channel && (
              <Descriptions.Item label="Kênh xác nhận">
                {receiptChannelLabels[request.receipt.channel]}
              </Descriptions.Item>
            )}
            {request.receipt?.receivedAt && (
              <Descriptions.Item label="Ngày nhận">{formatDate(request.receipt.receivedAt)}</Descriptions.Item>
            )}
          </Descriptions>
        </Card>
      )}
    </div>
  )
}
