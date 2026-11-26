import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { HOME_LINK } from '../home-styles'

interface SectionHeaderProps {
  id: string
  title: string
  /** Phần cuối tiêu đề tô màu nhấn, vd. "Đồ cho thuê" + "nổi bật" */
  highlight?: string
  subtitle?: string
  action?: { label: string; to: string }
}

export function SectionHeader({ id, title, highlight, subtitle, action }: SectionHeaderProps) {
  return (
    <header className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 id={id} className="text-2xl font-bold tracking-[-0.02em] text-site-ink sm:text-[28px] dark:text-white">
          {title}
          {highlight && <span className="text-site-highlight dark:text-amber-400"> {highlight}</span>}
        </h2>
        {subtitle && <p className="mt-1 text-sm text-site-muted dark:text-slate-400">{subtitle}</p>}
      </div>
      {action && (
        <Link to={action.to} className={HOME_LINK}>
          {action.label} <ArrowRight aria-hidden />
        </Link>
      )}
    </header>
  )
}
