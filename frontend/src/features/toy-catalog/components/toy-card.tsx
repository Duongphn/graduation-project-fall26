import { Baby, MapPin, ShieldCheck, ToyBrick } from 'lucide-react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useRevealOnScroll } from '../../../hooks/use-reveal-on-scroll'
import { toyDetailPath } from '../../../routes/paths'
import { formatVnd } from '../../toy-listings/format-vnd'
import { conditionLevel, formatAgeRange, formatPostedAgo } from '../catalog-search-params'
import type { ToyCard as ToyCardData } from '../toy-catalog-api'

/** Số tông nền pastel (--tint-0 … --tint-5 trong public-layout.css) */
const TINT_COUNT = 6

/** Cùng danh mục thì cùng tông nền: lưới nhiều màu nhưng vẫn có quy luật */
function tintOf(categoryId: string): number {
  let hash = 0
  for (const char of categoryId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return hash % TINT_COUNT
}

const LISTING_LABELS: Record<ToyCardData['listingType'], string> = {
  rent: 'Cho thuê',
  sell: 'Bán lại',
  donate: 'Quyên góp',
}

const distanceText = (km: number) => (km < 10 ? `${km.toFixed(1).replace('.', ',')} km` : `${Math.round(km)} km`)

/**
 * Tình trạng dạng 4 vạch (Mới 4 · Như mới 3 · Tốt 2 · Cũ nhiều 1): lướt qua lưới là so được độ mới
 * mà không phải đọc "(90–99%)". Tin ghi tình trạng tự do thì chỉ hiện chữ.
 */
export function ConditionMeter({ condition }: { condition: string }) {
  const { level, short } = conditionLevel(condition)
  return (
    <span className="condition" data-level={level} title={condition}>
      {level && (
        <span className="condition__bars" aria-hidden="true">
          {[1, 2, 3, 4].map((step) => (
            <i key={step} className={step <= level ? 'is-on' : undefined} />
          ))}
        </span>
      )}
      <span className="sr-only">Tình trạng: {condition}</span>
      <span aria-hidden="true">{short}</span>
    </span>
  )
}

/** Dòng dưới giá: điều bố mẹ cần biết thêm trước khi bấm vào, theo từng loại tin */
function PriceNote({ toy }: { toy: ToyCardData }) {
  if (toy.listingType === 'rent') {
    return toy.depositPrice ? (
      <p className="catalog-card__deposit">
        <ShieldCheck aria-hidden="true" />
        <span>
          Cọc <strong>{formatVnd(toy.depositPrice)}</strong>
        </span>
        <span className="catalog-card__deposit-note">hoàn khi trả</span>
      </p>
    ) : (
      <p className="catalog-card__deposit catalog-card__deposit--none">Không cần đặt cọc</p>
    )
  }
  return (
    <p className="catalog-card__deposit catalog-card__deposit--none">
      {toy.listingType === 'sell' ? 'Mua đứt, tiền giữ trung gian đến khi nhận đồ' : 'Gửi yêu cầu để nhận miễn phí'}
    </p>
  )
}

interface ToyCardProps {
  toy: ToyCardData
  /** Vị trí trong lưới: các card cùng hàng hiện lệch nhau một nhịp */
  index: number
  /** Khoảng cách tới vị trí đang lọc (km), chỉ có khi bật "Tìm đồ gần tôi" */
  distanceKm?: number
}

export function ToyCard({ toy, index, distanceKm }: ToyCardProps) {
  const ref = useRevealOnScroll<HTMLElement>(0.15)

  return (
    <article
      ref={ref}
      data-reveal
      className={`catalog-card catalog-card--${toy.listingType}`}
      style={{ '--reveal-delay': `${(index % 3) * 70}ms`, '--tint': `var(--tint-${tintOf(toy.category.id)})` } as CSSProperties}
    >
      <Link to={toyDetailPath(toy.id)} className="catalog-card__link">
        <div className="catalog-card__media">
          {toy.primaryImage ? (
            <img src={toy.primaryImage.url} alt="" loading="lazy" decoding="async" />
          ) : (
            <ToyBrick className="catalog-card__placeholder" aria-hidden="true" />
          )}
          <span className="catalog-card__badge">{LISTING_LABELS[toy.listingType]}</span>
          {distanceKm !== undefined && (
            <span className="catalog-card__distance">
              <MapPin aria-hidden="true" />
              Cách {distanceText(distanceKm)}
            </span>
          )}
        </div>

        <div className="catalog-card__body">
          <h3 className="catalog-card__title">{toy.title}</h3>

          <p className="catalog-card__price">
            <strong>{toy.listingType === 'donate' ? 'Miễn phí' : formatVnd(toy.priceOrRate)}</strong>
            {toy.listingType === 'rent' && <span>/ngày</span>}
          </p>
          <PriceNote toy={toy} />

          <div className="catalog-card__facts">
            <span className="catalog-card__age">
              <Baby aria-hidden="true" />
              {formatAgeRange(toy.ageRange)}
            </span>
            <ConditionMeter condition={toy.condition} />
          </div>

          <p className="catalog-card__foot">
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
    <div className="catalog-card catalog-card--skeleton" aria-hidden="true">
      <div className="catalog-card__media skeleton-block" />
      <div className="catalog-card__body">
        <span className="skeleton-line skeleton-line--lg" style={{ width: '80%' }} />
        <span className="skeleton-line skeleton-line--lg" style={{ width: '45%' }} />
        <span className="skeleton-line" style={{ width: '60%' }} />
        <span className="skeleton-line" style={{ width: '70%' }} />
      </div>
    </div>
  )
}
