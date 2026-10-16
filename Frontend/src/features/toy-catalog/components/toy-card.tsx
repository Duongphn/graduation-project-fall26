import { Baby, MapPin, Sparkles, ToyBrick } from 'lucide-react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useRevealOnScroll } from '../../../hooks/use-reveal-on-scroll'
import { toyDetailPath } from '../../../routes/paths'
import { formatVnd } from '../../toy-listings/format-vnd'
import { formatAgeRange, formatPostedAgo } from '../catalog-search-params'
import type { ToyCard as ToyCardData } from '../toy-catalog-api'

/** Số tông nền pastel (--tint-0 … --tint-5 trong toy-search.css) */
const TINT_COUNT = 6

/** Cùng danh mục thì cùng tông nền: lưới nhiều màu nhưng vẫn có quy luật */
function tintOf(categoryId: string): number {
  let hash = 0
  for (const char of categoryId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return hash % TINT_COUNT
}

const distanceText = (km: number) => (km < 10 ? `${km.toFixed(1).replace('.', ',')} km` : `${Math.round(km)} km`)

interface ToyCardProps {
  toy: ToyCardData
  /** Vị trí trong lưới: các card cùng hàng hiện lệch nhau một nhịp */
  index: number
  /** Khoảng cách tới vị trí đang lọc (km), chỉ có khi bật "Gần tôi" */
  distanceKm?: number
}

export function ToyCard({ toy, index, distanceKm }: ToyCardProps) {
  const ref = useRevealOnScroll<HTMLElement>(0.15)
  const isRent = toy.listingType === 'rent'

  return (
    <article
      ref={ref}
      data-reveal
      className={`toy-card toy-card--${toy.listingType}`}
      style={{ '--reveal-delay': `${(index % 3) * 70}ms`, '--tint': `var(--tint-${tintOf(toy.category.id)})` } as CSSProperties}
    >
      <Link to={toyDetailPath(toy.id)} className="toy-card__link">
        <div className="toy-card__media">
          {toy.primaryImage ? (
            <img src={toy.primaryImage.url} alt="" loading="lazy" decoding="async" />
          ) : (
            <ToyBrick className="toy-card__placeholder" aria-hidden="true" />
          )}
          <span className="toy-card__badge">{isRent ? 'Cho thuê' : 'Bán lại'}</span>
        </div>

        <div className="toy-card__body">
          <h3 className="toy-card__title">{toy.title}</h3>

          <p className="toy-card__price">
            <strong>{formatVnd(toy.priceOrRate)}</strong>
            {isRent && <span>/ngày</span>}
          </p>
          {/* Dòng cọc giữ chỗ cả khi trống để giá và thông tin các card cùng hàng thẳng nhau */}
          <p className="toy-card__sub">{isRent && toy.depositPrice ? `Cọc ${formatVnd(toy.depositPrice)}` : null}</p>

          <ul className="toy-card__facts">
            <li>
              <Baby aria-hidden="true" />
              {formatAgeRange(toy.ageRange)}
            </li>
            <li>
              <Sparkles aria-hidden="true" />
              {toy.condition}
            </li>
            {distanceKm !== undefined && (
              <li>
                <MapPin aria-hidden="true" />
                Cách {distanceText(distanceKm)}
              </li>
            )}
          </ul>

          <p className="toy-card__foot">
            <span>{toy.category.name}</span>
            <span>Đăng {formatPostedAgo(toy.createdAt)}</span>
          </p>
        </div>
      </Link>
    </article>
  )
}

/** Cùng kích thước với card thật để lưới không nhảy khi dữ liệu về */
export function ToyCardSkeleton() {
  return (
    <div className="toy-card toy-card--skeleton" aria-hidden="true">
      <div className="toy-card__media skeleton-block" />
      <div className="toy-card__body">
        <span className="skeleton-line skeleton-line--lg" style={{ width: '80%' }} />
        <span className="skeleton-line skeleton-line--lg" style={{ width: '45%' }} />
        <span className="skeleton-line" style={{ width: '35%' }} />
        <span className="skeleton-line" style={{ width: '70%' }} />
      </div>
    </div>
  )
}
