import { Button } from 'antd'
import { useState } from 'react'

import { ReasonModal } from '../../../components/common'
import { cancelReasonPresets } from '../constants'
import { useDonationActions } from '../hooks'
import type { DonationRequestDetail } from '../types'
import { ConfirmReceivedModal } from './ConfirmReceivedModal'

type OpenModal = 'cancel' | 'confirm' | undefined

// Admin buttons allowed by the current status (BF-04). No accept / reject: only the donor
// decides a PENDING request (D-04, the API answers 409 DONOR_DECISION_REQUIRED).
// PENDING, ACCEPTED or SHIPPING: cancel with a reason;
// SHIPPING: confirm receipt for the receiver, with a reason.
export function DonationActions({ request }: { request: DonationRequestDetail }) {
  const [modal, setModal] = useState<OpenModal>()
  const actions = useDonationActions(request.id)
  const close = () => setModal(undefined)

  const isPending = request.status === 'pending'
  const isShipping = request.status === 'shipping'
  const canCancel = isPending || request.status === 'accepted' || isShipping

  return (
    <div className="flex flex-wrap gap-2">
      {isShipping && (
        <Button type="primary" onClick={() => setModal('confirm')}>
          Xác nhận đã nhận
        </Button>
      )}
      {canCancel && <Button onClick={() => setModal('cancel')}>Huỷ yêu cầu</Button>}

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
