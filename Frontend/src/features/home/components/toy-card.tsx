import { MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toyDetailPath } from '../../../routes/paths'
import { FavoriteButton } from '../../favorites/components/favorite-button'
import { formatVnd } from '../../toy-listings/format-vnd'
import type { HomeCategory, PublicToy } from '../home-api'
import { formatAgeRange, shortCondition } from '../toy-display'
import { ToyMedia } from './toy-media'

interface ToyCardProps {
  toy: PublicToy
  category?: HomeCategory
}

const LISTING_TYPE_LABELS: Record<PublicToy['listingType'], string> = {
  rent: 'Cho thuê',
  sell: 'Bán lại',
  donate: 'Quyên góp',
}

/** Thẻ đồ chơi dùng chung cho mục thuê và bán lại — cả thẻ bấm được nhờ link phủ (stretched link) */
export function ToyCard({ toy, category }: ToyCardProps) {
  const isRent = toy.listingType === 'rent'

  return (
    <article className={`toy-card toy-card--${toy.listingType}`}>
      <div className="toy-card__media">
        <ToyMedia imageUrl={toy.images[0]?.url} alt={toy.title} category={category} />
        <span className="toy-card__badge">{LISTING_TYPE_LABELS[toy.listingType]}</span>
        {/* Nằm trên link phủ thẻ (z-index) nên bấm ♡ không mở trang chi tiết */}
        <FavoriteButton toyId={toy.id} toyTitle={toy.title} className="toy-card__favorite" />
      </div>

      <div className="toy-card__body">
        <h3 className="toy-card__title">
          <Link to={toyDetailPath(toy.id)} className="toy-card__link">
            {toy.title}
          </Link>
        </h3>

        <p className="toy-card__price">
          {toy.listingType === 'donate' ? 'Miễn phí' : formatVnd(toy.priceOrRate)}
          {isRent && <span className="toy-card__unit"> /ngày</span>}
        </p>
        {isRent && toy.depositPrice !== undefined && (
          <p className="toy-card__deposit">Cọc {formatVnd(toy.depositPrice)}</p>
        )}
        {toy.district && (
          <p className="toy-card__location">
            <MapPin aria-hidden />
            <span className="sr-only">Khu vực: </span>
            <span className="toy-card__location-text">{toy.district}</span>
          </p>
        )}
      </div>

      <dl className="toy-card__meta">
        <div>
          <dt className="sr-only">Độ tuổi</dt>
          <dd>{formatAgeRange(toy.ageRange)}</dd>
        </div>
        <div>
          <dt className="sr-only">Tình trạng</dt>
          <dd>{shortCondition(toy.condition)}</dd>
        </div>
      </dl>
    </article>
  )
}

export function ToyCardSkeleton() {
  return (
    <div className="toy-card toy-card--skeleton" aria-hidden>
      <div className="toy-card__media home-skeleton" />
      <div className="toy-card__body">
        <span className="home-skeleton home-skeleton--line" />
        <span className="home-skeleton home-skeleton--line home-skeleton--short" />
      </div>
    </div>
  )
}
