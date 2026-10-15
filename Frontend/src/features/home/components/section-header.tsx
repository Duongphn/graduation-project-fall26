import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'

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
    <header className="home-section-header">
      <div>
        <h2 id={id} className="home-section-header__title">
          {title}
          {highlight && <span className="home-highlight"> {highlight}</span>}
        </h2>
        {subtitle && <p className="home-section-header__subtitle">{subtitle}</p>}
      </div>
      {action && (
        <Link to={action.to} className="home-link">
          {action.label} <ArrowRight aria-hidden />
        </Link>
      )}
    </header>
  )
}
