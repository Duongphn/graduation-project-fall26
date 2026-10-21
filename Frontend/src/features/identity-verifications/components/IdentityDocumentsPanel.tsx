import { ReloadOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Empty, Image, Typography } from 'antd'

import { formatDateTime } from '../../../utils/format'
import { identityDocuments } from '../constants'
import type { IdentityVerificationDetail } from '../types'

interface IdentityDocumentsPanelProps {
  verification: IdentityVerificationDetail
  refreshing?: boolean
  onRefresh: () => void
}

// Both sides of the citizen ID card and the selfie, side by side with zoom. Links exist only
// while the request is PENDING; each load is recorded in the audit log by the server.
export function IdentityDocumentsPanel({
  verification,
  refreshing,
  onRefresh,
}: IdentityDocumentsPanelProps) {
  const isPending = verification.status === 'pending'

  return (
    <Card
      title="Giấy tờ đã gửi"
      extra={
        isPending && (
          <div className="flex flex-wrap items-center gap-3">
            {verification.previewExpiresAt && (
              <Typography.Text type="secondary">
                Link xem ảnh hết hạn lúc {formatDateTime(verification.previewExpiresAt)}
              </Typography.Text>
            )}
            <Button icon={<ReloadOutlined />} loading={refreshing} onClick={onRefresh}>
              Tải lại ảnh
            </Button>
          </div>
        )
      }
    >
      {!isPending ? (
        <Alert
          type="info"
          showIcon
          title="Yêu cầu đã được xử lý"
          description="Ảnh giấy tờ chỉ được xem khi yêu cầu đang chờ duyệt, để bảo vệ dữ liệu cá nhân."
        />
      ) : (
        <>
          {!verification.previewAvailable && (
            <Alert
              className="mb-4"
              type="warning"
              showIcon
              title="Chưa tạo được link xem ảnh riêng tư"
              description="Máy chủ chưa cấu hình Cloudinary nên không ký được link xem ảnh có hạn 5 phút."
            />
          )}
          <Image.PreviewGroup>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {identityDocuments.map((document) => {
                const link = verification.documents[document.key]
                return (
                  <div key={document.key} className="flex flex-col gap-2">
                    <Typography.Text strong>{document.label}</Typography.Text>
                    <div className="flex h-72 items-center justify-center overflow-hidden rounded-lg border border-border bg-background">
                      {link ? (
                        <Image
                          src={link.url}
                          alt={document.label}
                          width="100%"
                          height={288}
                          classNames={{ image: 'object-contain' }}
                        />
                      ) : (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Không có link xem ảnh" />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </Image.PreviewGroup>
        </>
      )}
    </Card>
  )
}
