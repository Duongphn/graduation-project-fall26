import { CheckOutlined, CloseOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Divider, Popconfirm } from 'antd'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { ReasonModal } from '../../../components/common'
import { ApiError } from '../../../services/api-error'
import { adminPaths } from '../../../routes/paths'
import { formatDateTime } from '../../../utils/format'
import { identityChecklist, identityRejectReasons } from '../constants'
import { useApproveIdentity, useRejectIdentity } from '../hooks'
import type { IdentityVerificationDetail } from '../types'
import { ReviewChecklist } from './ReviewChecklist'

interface IdentityReviewPanelProps {
  verification: IdentityVerificationDetail
}

// Checklist and the two decisions. Once decided, the result replaces the buttons.
export function IdentityReviewPanel({ verification }: IdentityReviewPanelProps) {
  const navigate = useNavigate()
  const [checked, setChecked] = useState<string[]>([])
  const [rejectOpen, setRejectOpen] = useState(false)

  // After a decision, go back to the queue to take the next request.
  const backToQueue = () => navigate(adminPaths.identityVerifications)
  const approve = useApproveIdentity({ onSuccess: backToQueue })
  const reject = useRejectIdentity({
    onSuccess: () => {
      setRejectOpen(false)
      backToQueue()
    },
    // Keep the modal (and the typed reason) open on errors, except when the request was already
    // decided by someone else: then the refreshed detail shows the result.
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) setRejectOpen(false)
    },
  })

  const busy = approve.isPending || reject.isPending
  const allChecked = checked.length === identityChecklist.length

  if (verification.status !== 'PENDING') {
    return (
      <Card title="Kết quả xử lý">
        {verification.status === 'VERIFIED' ? (
          <Alert type="success" showIcon title={`Đã xác minh lúc ${formatDateTime(verification.reviewedAt)}`} />
        ) : (
          <Alert
            type="error"
            showIcon
            title={`Đã từ chối lúc ${formatDateTime(verification.reviewedAt)}`}
            description={verification.rejectReason ? `Lý do: ${verification.rejectReason}` : undefined}
          />
        )}
      </Card>
    )
  }

  return (
    <Card title="Kiểm tra và quyết định">
      <ReviewChecklist value={checked} onChange={setChecked} disabled={busy} />
      <Divider className="my-4" />
      <div className="flex flex-wrap gap-3">
        <Popconfirm
          title="Xác minh danh tính người dùng này?"
          description={
            allChecked
              ? 'Tài khoản sẽ được đánh dấu đã xác minh danh tính.'
              : `Bạn mới đánh dấu ${checked.length}/${identityChecklist.length} mục kiểm tra. Vẫn xác minh?`
          }
          okText="Xác minh"
          cancelText="Huỷ"
          disabled={busy}
          onConfirm={() => approve.mutate(verification.id)}
        >
          <Button type="primary" icon={<CheckOutlined />} loading={approve.isPending} disabled={reject.isPending}>
            Xác minh
          </Button>
        </Popconfirm>
        <Button danger icon={<CloseOutlined />} disabled={busy} onClick={() => setRejectOpen(true)}>
          Từ chối
        </Button>
      </div>
      <ReasonModal
        open={rejectOpen}
        title="Từ chối xác minh danh tính"
        okText="Từ chối"
        label="Lý do (người dùng sẽ thấy lý do này và có thể gửi lại yêu cầu)"
        presets={identityRejectReasons}
        presetMode="append"
        loading={reject.isPending}
        onCancel={() => setRejectOpen(false)}
        onSubmit={(reason) => reject.mutate({ id: verification.id, reason })}
      />
    </Card>
  )
}
