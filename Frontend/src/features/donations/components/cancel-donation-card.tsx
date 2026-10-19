import { CircleX, X } from 'lucide-react'
import { useState } from 'react'

import { ReasonModal } from '../../../components/common'
import { donorCancelReasonPresets } from '../constants'

interface CancelDonationCardProps {
  loading: boolean
  // onDone đóng hộp thoại khi huỷ thành công (lỗi thì giữ nguyên lý do đã nhập)
  onCancel: (note: string, onDone: () => void) => void
}

/** Donor huỷ phiếu trước khi gửi hàng (PENDING/ACCEPTED); đang chuyển thì chỉ Admin huỷ được */
export function CancelDonationCard({ loading, onCancel }: CancelDonationCardProps) {
  const [open, setOpen] = useState(false)

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
          Chỉ huỷ được khi bạn <strong>chưa gửi hàng</strong>. Đồ chơi sẽ trở lại trạng thái đang tặng.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={loading}
        className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 hover:border-red-400 disabled:opacity-60"
      >
        <X className="size-4" aria-hidden /> Huỷ phiếu quyên góp
      </button>

      <ReasonModal
        open={open}
        title="Huỷ phiếu quyên góp"
        okText="Huỷ phiếu"
        label="Lý do huỷ (bên nhận sẽ thấy)"
        presets={donorCancelReasonPresets}
        loading={loading}
        onCancel={() => setOpen(false)}
        onSubmit={(note) => onCancel(note, () => setOpen(false))}
      />
    </section>
  )
}
