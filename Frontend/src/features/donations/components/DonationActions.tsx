import { Button, Popconfirm } from 'antd'
import { useState } from 'react'

import { ReasonModal } from '../../../components/common'
import { cancelReasonPresets, rejectReasonPresets } from '../constants'
import { useDonationActions } from '../hooks'
import type { DonationRequestDetail } from '../types'
import { ConfirmReceivedModal } from './ConfirmReceivedModal'

type OpenModal = 'reject' | 'cancel' | 'confirm' | undefined

// Admin buttons allowed by the current status (BF-04):
// PENDING: accept / reject; PENDING, ACCEPTED or SHIPPING: cancel with a reason;
// SHIPPING: confirm receipt for the receiver, with a reason.
export function DonationActions({ request }: { request: DonationRequestDetail }) {
  const [modal, setModal] = useState<OpenModal>()
  const actions = useDonationActions(request.id)
  const close = () => setModal(undefined)

  const isPending = request.status === 'PENDING'
  const isShipping = request.status === 'SHIPPING'
  const canCancel = isPending || request.status === 'ACCEPTED' || isShipping

  return (
    <div className="flex flex-wrap gap-2">
      {isPending && (
        <Popconfirm
          title="Chấp nhận yêu cầu này?"
          description="Đồ chơi được giữ cho bên nhận; các yêu cầu đang chờ khác sẽ bị từ chối."
          okText="Chấp nhận"
          cancelText="Không"
          onConfirm={() => actions.accept.mutateAsync()}
        >
          <Button type="primary" loading={actions.accept.isPending}>
            Chấp nhận
          </Button>
        </Popconfirm>
      )}
      {isPending && (
        <Button danger onClick={() => setModal('reject')}>
          Từ chối
        </Button>
      )}
      {isShipping && (
        <Button type="primary" onClick={() => setModal('confirm')}>
          Xác nhận đã nhận
        </Button>
      )}
      {canCancel && <Button onClick={() => setModal('cancel')}>Huỷ yêu cầu</Button>}

      <ReasonModal
        open={modal === 'reject'}
        title="Từ chối yêu cầu nhận tặng"
        okText="Từ chối"
        presets={rejectReasonPresets}
        loading={actions.reject.isPending}
        onCancel={close}
        onSubmit={(reason) => actions.reject.mutate(reason, { onSuccess: close })}
      />
      <ReasonModal
        open={modal === 'cancel'}
        title={isShipping ? 'Huỷ yêu cầu đang bàn giao' : 'Huỷ yêu cầu nhận tặng'}
        okText="Huỷ yêu cầu"
        presets={cancelReasonPresets}
        loading={actions.cancel.isPending}
        onCancel={close}
        onSubmit={(reason) => actions.cancel.mutate(reason, { onSuccess: close })}
      />
      <ConfirmReceivedModal
        open={modal === 'confirm'}
        receiverName={request.organization?.name ?? request.requester?.fullName}
        loading={actions.confirmReceived.isPending}
        onCancel={close}
        onSubmit={(input) => actions.confirmReceived.mutate(input, { onSuccess: close })}
      />
    </div>
  )
}
