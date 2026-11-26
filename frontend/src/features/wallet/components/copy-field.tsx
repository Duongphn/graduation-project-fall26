import { Check, Copy } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

interface CopyFieldProps {
  label: string
  /** Chuỗi được chép vào clipboard */
  value: string
  /** Cách hiển thị (mặc định là `value`) */
  children?: ReactNode
  /** Làm nổi bật (số tiền, nội dung chuyển khoản) */
  emphasis?: boolean
}

/** Một dòng thông tin chuyển khoản kèm nút Sao chép */
export function CopyField({ label, value, children, emphasis = false }: CopyFieldProps) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
    } catch {
      // Trình duyệt chặn clipboard: người dùng vẫn đọc và gõ tay được
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <dt className="text-xs text-tf-ink-muted">{label}</dt>
        <dd
          className={`mt-0.5 break-words ${
            emphasis ? 'text-base font-bold text-tf-primary sm:text-lg' : 'text-sm font-semibold text-tf-ink'
          } tabular-nums`}
        >
          {children ?? value}
        </dd>
      </div>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={`Sao chép ${label.toLowerCase()}`}
        className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors ${
          copied
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-tf-surface text-tf-primary hover:border-tf-primary'
        }`}
      >
        {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
        {copied ? 'Đã chép' : 'Sao chép'}
      </button>
    </div>
  )
}
