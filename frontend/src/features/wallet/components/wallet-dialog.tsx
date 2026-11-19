import { X } from 'lucide-react'
import { useId, useRef, type ReactNode } from 'react'

import { useDialogBehavior } from '../use-dialog-behavior'

interface WalletDialogProps {
  title: string
  subtitle?: ReactNode
  /** Đang gửi yêu cầu: khoá nút đóng, bấm nền và Esc */
  busy: boolean
  onClose: () => void
  children: ReactNode
}

/** Khung hộp thoại của màn hình ví: nền mờ, tiêu đề, nút đóng; trên điện thoại trượt lên từ đáy */
export function WalletDialog({ title, subtitle, busy, onClose, children }: WalletDialogProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  useDialogBehavior(panelRef, { onClose, busy })

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <button
        type="button"
        aria-label={`Đóng: ${title}`}
        tabIndex={-1}
        className="absolute inset-0 cursor-default"
        onClick={() => !busy && onClose()}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-lg font-bold text-tf-ink">
              {title}
            </h2>
            {subtitle && <p className="mt-1 text-sm text-tf-ink-muted">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Đóng"
            className="grid size-9 shrink-0 place-items-center rounded-full text-tf-ink-muted hover:bg-tf-surface disabled:opacity-50"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
