import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  /** `error` dùng role="alert" để trình đọc màn hình thông báo ngay */
  variant?: 'empty' | 'error'
}

export function EmptyState({ icon: Icon, title, description, action, variant = 'empty' }: EmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-site-line bg-white/60 px-6 py-10 text-center dark:border-night-700 dark:bg-night-900/60"
      role={variant === 'error' ? 'alert' : undefined}
    >
      <Icon className={`mb-1 size-8 ${variant === 'error' ? 'text-tf-error' : 'text-tf-ink-muted'}`} aria-hidden />
      <p className="font-semibold text-site-ink dark:text-white">{title}</p>
      {description && <p className="max-w-md text-sm text-site-muted dark:text-slate-400">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
