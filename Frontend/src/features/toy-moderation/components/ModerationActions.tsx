import { CheckOutlined, CloseOutlined } from '@ant-design/icons'
import { Button, Popconfirm, Tooltip } from 'antd'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { ReasonModal } from '../../../components/common'
import { rejectReasonPresets } from '../constants'
import { useApproveToy, useRejectToy } from '../hooks'
import type { ToyModerationDetail } from '../types'

interface ModerationActionsProps {
  toy: ToyModerationDetail
  // Where to go after a decision: the queue, with its tab and filters.
  backTo: string
}

// "Duyệt" (with confirmation) and "Từ chối" (with a reason) for a pending post. Every decision
// sends the updatedAt the Admin is looking at; on a 409 the detail is refetched in place.
export function ModerationActions({ toy, backTo }: ModerationActionsProps) {
  const navigate = useNavigate()
  const [rejectOpen, setRejectOpen] = useState(false)
  const approve = useApproveToy({ onSuccess: () => navigate(backTo) })
  const reject = useRejectToy({
    onSuccess: () => {
      setRejectOpen(false)
      navigate(backTo)
    },
  })

  if (toy.status !== 'PENDING_REVIEW') {
    return <Button onClick={() => navigate(backTo)}>Quay lại danh sách</Button>
  }

  // The backend refuses too (409 CATEGORY_NOT_AVAILABLE); the button explains it up front.
  const categoryBlocked = toy.category?.status !== 'ACTIVE'
  const busy = approve.isPending || reject.isPending

  return (
    <>
      <Tooltip
        title={categoryBlocked ? 'Danh mục đang bị ẩn nên không thể duyệt tin này.' : undefined}
      >
        <Popconfirm
          title="Duyệt tin đăng này?"
          description="Tin sẽ hiển thị công khai cho mọi người."
          okText="Duyệt"
          cancelText="Huỷ"
          disabled={categoryBlocked || busy}
          onConfirm={() => approve.mutate({ id: toy.id, expectedUpdatedAt: toy.updatedAt })}
        >
          <Button
            type="primary"
            icon={<CheckOutlined />}
            loading={approve.isPending}
            disabled={categoryBlocked || reject.isPending}
          >
            Duyệt
          </Button>
        </Popconfirm>
      </Tooltip>
      <Button
        danger
        icon={<CloseOutlined />}
        disabled={approve.isPending}
        onClick={() => setRejectOpen(true)}
      >
        Từ chối
      </Button>
      <ReasonModal
        open={rejectOpen}
        title={`Từ chối tin "${toy.title}"`}
        okText="Từ chối"
        label="Lý do (gửi cho người đăng)"
        presets={rejectReasonPresets}
        loading={reject.isPending}
        onCancel={() => setRejectOpen(false)}
        // The modal stays open on an error, so the typed reason is kept.
        onSubmit={(reason) =>
          reject.mutate({ id: toy.id, expectedUpdatedAt: toy.updatedAt, reason })
        }
      />
    </>
  )
}
