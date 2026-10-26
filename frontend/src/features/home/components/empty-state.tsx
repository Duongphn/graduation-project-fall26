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
    <div className={`home-empty home-empty--${variant}`} role={variant === 'error' ? 'alert' : undefined}>
      <Icon className="home-empty__icon" aria-hidden />
      <p className="home-empty__title">{title}</p>
      {description && <p className="home-empty__description">{description}</p>}
      {action}
    </div>
  )
}
