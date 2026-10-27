import { ImageOff, Send, ShieldCheck } from 'lucide-react'

import { handoverMethodLabels, type HandoverMethod } from '../constants'

interface DonationPostSummaryProps {
  title: string
  coverUrl: string | undefined
  ageLabel: string | undefined
  condition: string
  receiverName: string
  handoverMethod: HandoverMethod
  safetyChecked: number
  safetyTotal: number
  blocked: boolean
  submitting: boolean
  error: string | null
  onSubmit: () => void
}

/** Khung bên phải: xem trước phiếu và nút gửi (cố định khi cuộn trên màn rộng) */
export function DonationPostSummary({
  title,
  coverUrl,
  ageLabel,
  condition,
  receiverName,
  handoverMethod,
  safetyChecked,
  safetyTotal,
  blocked,
  submitting,
  error,
  onSubmit,
}: DonationPostSummaryProps) {
  const safe = safetyChecked === safetyTotal && !blocked

  return (
    <aside aria-label="Xem trước phiếu quyên góp" className="flex flex-col gap-4 lg:sticky lg:top-20">
      <section className="rounded-xl border border-tf-surface bg-white p-5">
        <h2 className="text-xs font-bold tracking-[0.06em] text-tf-ink-muted uppercase">Phiếu quyên góp dự kiến</h2>
        <div className="mt-3 flex gap-3">
          {coverUrl ? (
            <img src={coverUrl} alt="" className="size-16 shrink-0 rounded-lg object-cover" />
          ) : (
            <span className="grid size-16 shrink-0 place-items-center rounded-lg bg-tf-page text-tf-ink-muted">
              <ImageOff className="size-5" aria-hidden />
            </span>
          )}
          <div className="min-w-0 text-sm">
            <p className="line-clamp-2 font-semibold text-tf-ink">{title || 'Chưa nhập tên đồ chơi'}</p>
            <p className="text-xs text-tf-ink-muted">
              {[ageLabel, condition].filter(Boolean).join(' · ') || 'Chưa chọn độ tuổi, tình trạng'}
            </p>
          </div>
        </div>

        <dl className="mt-4 flex flex-col gap-2 border-t border-tf-surface pt-4 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-tf-ink-muted">Cơ sở tiếp nhận</dt>
            <dd className="text-right font-medium text-tf-ink">{receiverName}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-tf-ink-muted">Bàn giao</dt>
            <dd className="text-right font-medium text-tf-ink">{handoverMethodLabels[handoverMethod]}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-tf-ink-muted">Kiểm duyệt an toàn</dt>
            <dd className={`flex items-center gap-1 font-semibold ${safe ? 'text-tf-secondary' : 'text-tf-ink-muted'}`}>
              <ShieldCheck className="size-4" aria-hidden />
              {blocked ? 'Bị từ chối' : `${safetyChecked}/${safetyTotal}`}
            </dd>
          </div>
        </dl>

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting || blocked}
          className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-tf-primary px-6 text-sm font-bold text-white transition-colors hover:bg-tf-primary-container disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Send className="size-4" aria-hidden />
          {submitting ? 'Đang gửi phiếu…' : 'Xác nhận & tạo phiếu quyên góp'}
        </button>
        <p className="mt-2 text-center text-xs text-tf-ink-muted">
          Admin kiểm duyệt ảnh và an toàn trước khi tổ chức nhìn thấy đồ chơi.
        </p>
      </section>
    </aside>
  )
}
