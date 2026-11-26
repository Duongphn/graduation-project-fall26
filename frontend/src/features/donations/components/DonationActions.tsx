import { Button, Popconfirm, Tooltip } from 'antd'
import { useState } from 'react'

import { ReasonModal } from '../../../components/common'
import { cancelReasonPresets, rejectReasonPresets } from '../constants'
import { useDonationActions } from '../hooks'
import type { DonationRequestDetail } from '../types'
import { ConfirmReceivedModal } from './ConfirmReceivedModal'
import { OrganizationReceiptModal } from './OrganizationReceiptModal'

type OpenModal = 'cancel' | 'reject' | 'confirm' | undefined

// Admin buttons allowed by the current status (BF-04, R03 III.7.5.2).
// PENDING and decided by the Admin (GB-56: a request the Donor sent to an organization): accept,
// or reject with a reason. The Donor decides the other PENDING requests.
// PENDING, ACCEPTED or SHIPPING: cancel with a reason.
// SHIPPING: confirm receipt; for an organization with who, channel, date and photos (GB-59),
// for a USER receiver with a reason.
export function DonationActions({ request }: { request: DonationRequestDetail }) {
  const [modal, setModal] = useState<OpenModal>()
  const actions = useDonationActions(request.id)
  const close = () => setModal(undefined)

  const isPending = request.status === 'pending'
  const isShipping = request.status === 'shipping'
  const canCancel = isPending || request.status === 'accepted' || isShipping
  const adminDecides = isPending && request.decider === 'ADMIN'
  const organizationHidden = request.organization?.status === 'hidden'
  // GB-51: an organization saved before receiving points existed takes no toy until it has one.
  const noReceivingPoint = request.organization !== null && request.organization.receivingPoint === null
  const acceptBlocked = organizationHidden
    ? 'Tổ chức đang ẩn: không thể chấp nhận.'
    : noReceivingPoint
      ? 'Tổ chức chưa có điểm nhận: hãy nhập điểm nhận cho tổ chức hoặc từ chối yêu cầu.'
      : undefined
  const forOrganization = request.receiverType === 'ORGANIZATION'
  const sentAt = request.handovers.find((handover) => handover.step === 'DONOR_SENT')?.at

  return (
    <div className="flex flex-wrap gap-2">
      {adminDecides && (
        <>
          <Popconfirm
            title="Chấp nhận yêu cầu cho tổ chức?"
            description="Đồ chơi được ẩn khỏi danh sách và các yêu cầu khác cho đồ chơi này bị từ chối."
            okText="Chấp nhận"
            cancelText="Huỷ"
            disabled={acceptBlocked !== undefined}
            onConfirm={() => actions.accept.mutateAsync()}
          >
            <Tooltip title={acceptBlocked}>
              <Button type="primary" disabled={acceptBlocked !== undefined} loading={actions.accept.isPending}>
                Chấp nhận
              </Button>
            </Tooltip>
          </Popconfirm>
          <Button danger onClick={() => setModal('reject')}>
            Từ chối
          </Button>
        </>
      )}
      {isShipping && (
        <Button type="primary" onClick={() => setModal('confirm')}>
          Xác nhận đã nhận
        </Button>
      )}
      {canCancel && <Button onClick={() => setModal('cancel')}>Huỷ yêu cầu</Button>}

      <ReasonModal
        open={modal === 'reject'}
        title="Từ chối yêu cầu thay tổ chức"
        okText="Từ chối"
        presets={rejectReasonPresets}
        loading={actions.reject.isPending}
        onCancel={close}
        onSubmit={(reason) => actions.reject.mutate(reason, { onSuccess: close })}
      />
      <ReasonModal
        open={modal === 'cancel'}
        // GB-60: a cancelled handover keeps the toy hidden; before it, the toy is listed again.
        title={
          isShipping
            ? 'Huỷ yêu cầu đang bàn giao (đồ chơi vẫn ẩn tới khi người tặng sửa hoặc xoá tin)'
            : 'Huỷ yêu cầu nhận tặng'
        }
        okText="Huỷ yêu cầu"
        presets={cancelReasonPresets}
        loading={actions.cancel.isPending}
        onCancel={close}
        onSubmit={(reason) => actions.cancel.mutate(reason, { onSuccess: close })}
      />
      {forOrganization ? (
        <OrganizationReceiptModal
          open={modal === 'confirm'}
          organizationName={request.organization?.name}
          sentAt={sentAt}
          loading={actions.confirmReceived.isPending}
          onCancel={close}
          onSubmit={(input) => actions.confirmReceived.mutate(input, { onSuccess: close })}
        />
      ) : (
        <ConfirmReceivedModal
          open={modal === 'confirm'}
          receiverName={request.requester?.fullName}
          loading={actions.confirmReceived.isPending}
          onCancel={close}
          onSubmit={(input) => actions.confirmReceived.mutate(input, { onSuccess: close })}
        />
      )}
    </div>
  )
}
