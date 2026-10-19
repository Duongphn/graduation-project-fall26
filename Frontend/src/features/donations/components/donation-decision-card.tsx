import { Check, X } from 'lucide-react'
import { useState } from 'react'

import { ReasonModal } from '../../../components/common'
import { donorRejectReasonPresets } from '../constants'

interface DonationDecisionCardProps {
  requesterName: string
  message: string | null
  accepting: boolean
  rejecting: boolean
  onAccept: () => void
  // onDone đóng hộp thoại khi từ chối thành công
  onReject: (reason: string, onDone: () => void) => void
}

/** PENDING: chỉ Donor quyết định tặng hay không (D-04) */
export function DonationDecisionCard({
  requesterName,
  message,
  accepting,
  rejecting,
  onAccept,
  onReject,
}: DonationDecisionCardProps) {
  const [rejectOpen, setRejectOpen] = useState(false)
  const busy = accepting || rejecting

  return (
    <section aria-labelledby="decision-title" className="rounded-xl border border-tf-surface bg-white p-5 sm:p-6">
      <h2 id="decision-title" className="text-lg font-bold text-tf-ink">
        {requesterName} muốn nhận đồ chơi này
      </h2>
      {message && (
        <blockquote className="mt-3 rounded-lg bg-tf-page p-3 text-sm leading-6 whitespace-pre-line text-tf-ink">
          “{message}”
        </blockquote>
      )}
      <p className="mt-3 text-sm leading-6 text-tf-ink-muted">
        Khi bạn đồng ý, đồ chơi được giữ cho bên nhận và các yêu cầu khác của đồ chơi này tự động bị từ chối.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onAccept}
          disabled={busy}
          className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-tf-primary px-5 text-sm font-bold text-white hover:bg-tf-primary-container disabled:opacity-60"
        >
          <Check className="size-4" aria-hidden /> {accepting ? 'Đang xử lý…' : 'Đồng ý tặng'}
        </button>
        <button
          type="button"
          onClick={() => setRejectOpen(true)}
          disabled={busy}
          className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-tf-surface px-5 text-sm font-semibold text-tf-ink hover:border-tf-outline disabled:opacity-60"
        >
          <X className="size-4" aria-hidden /> Từ chối
        </button>
      </div>

      <ReasonModal
        open={rejectOpen}
        title="Từ chối yêu cầu nhận"
        okText="Từ chối"
        presets={donorRejectReasonPresets}
        loading={rejecting}
        onCancel={() => setRejectOpen(false)}
        onSubmit={(reason) => onReject(reason, () => setRejectOpen(false))}
      />
    </section>
  )
}
