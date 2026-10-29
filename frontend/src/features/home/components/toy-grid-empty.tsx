import { ArrowRight, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

export interface ToyGridEmptyContent {
  icon: LucideIcon
  title: string
  description: string
  ctaLabel: string
  to: string
}

interface ToyGridEmptyProps extends ToyGridEmptyContent {
  /** Số thẻ khung mờ phía sau (1 hàng) — chỉ để giữ nhịp bố cục, không phải dữ liệu */
  ghostCount: number
  variant: 'rent' | 'sell' | 'donate'
}

/** Trạng thái chưa có tin: hàng thẻ khung mờ (trang trí) + lời mời đăng tin ở giữa */
export function ToyGridEmpty({ icon: Icon, title, description, ctaLabel, to, ghostCount, variant }: ToyGridEmptyProps) {
  return (
    <div className={`toy-grid-empty toy-grid-empty--${variant}`}>
      <div className="toy-grid toy-grid-empty__ghosts" aria-hidden>
        {Array.from({ length: ghostCount }, (_, index) => (
          <div key={index} className="toy-card toy-card--ghost">
            <div className="toy-card__media" />
            <div className="toy-card__body">
              <span className="toy-card--ghost__line" />
              <span className="toy-card--ghost__line toy-card--ghost__line--short" />
            </div>
          </div>
        ))}
      </div>

      <div className="toy-grid-empty__message">
        <span className="toy-grid-empty__icon" aria-hidden>
          <Icon />
        </span>
        <p className="toy-grid-empty__title">{title}</p>
        <p className="toy-grid-empty__description">{description}</p>
        <Link to={to} className="home-button home-button--navy home-button--small">
          {ctaLabel} <ArrowRight aria-hidden />
        </Link>
      </div>
    </div>
  )
}
