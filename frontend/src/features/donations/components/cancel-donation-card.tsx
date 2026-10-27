import { CircleX, X } from 'lucide-react'
import { useState } from 'react'

import { ReasonModal } from '../../../components/common'
import { donorCancelReasonPresets, receiverCancelReasonPresets } from '../constants'

interface CancelDonationCardProps {
  loading: boolean
  // Bên nhận huỷ yêu cầu của mình: lời và lý do gợi ý theo vai bên nhận
  perspective?: 'donor' | 'receiver'
  // onDone đóng hộp thoại khi huỷ thành công (lỗi thì giữ nguyên lý do đã nhập)
  onCancel: (note: string, onDone: () => void) => void
}

/** Donor huỷ phiếu trước khi gửi hàng (PENDING/ACCEPTED); đang chuyển thì chỉ Admin huỷ được */
export function CancelDonationCard({ loading, perspective = 'donor', onCancel }: CancelDonationCardProps) {
  const [open, setOpen] = useState(false)
  const forReceiver = perspective === 'receiver'
  const title = forReceiver ? 'Huỷ yêu cầu nhận' : 'Huỷ phiếu quyên góp'

  return (
    <section
      aria-labelledby="cancel-title"
      className="flex flex-col gap-3 rounded-xl border border-tf-surface bg-white p-5 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="text-sm leading-6">
        <h2 id="cancel-title" className="flex items-center gap-2 font-semibold text-tf-ink">
          <CircleX className="size-4 text-red-600" aria-hidden /> Bạn muốn thay đổi kế hoạch?
        </h2>
        <p className="text-tf-ink-muted">
          {forReceiver ? (
            <>
              Chỉ huỷ được khi người tặng <strong>chưa gửi hàng</strong>. Người tặng sẽ được thông báo.
            </>
          ) : (
            <>
              Chỉ huỷ được khi bạn <strong>chưa gửi hàng</strong>. Đồ chơi sẽ trở lại trạng thái đang tặng.
            </>
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={loading}
        className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 hover:border-red-400 disabled:opacity-60"
      >
        <X className="size-4" aria-hidden /> {title}
      </button>

      <ReasonModal
        open={open}
        title={title}
        okText={forReceiver ? 'Huỷ yêu cầu' : 'Huỷ phiếu'}
        label={forReceiver ? 'Lý do huỷ (người tặng sẽ thấy)' : 'Lý do huỷ (bên nhận sẽ thấy)'}
        presets={forReceiver ? receiverCancelReasonPresets : donorCancelReasonPresets}
        loading={loading}
        onCancel={() => setOpen(false)}
        onSubmit={(note) => onCancel(note, () => setOpen(false))}
      />
    </section>
  )
}
