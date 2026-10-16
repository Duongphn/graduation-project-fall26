import { useQuery } from '@tanstack/react-query'
import { Bookmark, ChevronRight, Flag, Home, MessageCircle, ShoppingBag } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { RentalBookingCard } from '../features/toy-catalog/components/rental-booking-card'
import { SimilarToys } from '../features/toy-catalog/components/similar-toys'
import { ToyGallery } from '../features/toy-catalog/components/toy-gallery'
import { formatAgeRange, toCatalogSearch } from '../features/toy-catalog/catalog-search-params'
import type { ToyDetail } from '../features/toy-catalog/toy-catalog-api'
import { toyDetailQuery } from '../features/toy-catalog/toy-catalog-queries'
import { formatVnd } from '../features/toy-listings/format-vnd'
import { formatDate } from '../features/toy-listings/listing-display'
import { AccountLayout } from '../layouts/account/account-layout'
import { PATHS } from '../routes/paths'
import { getApiErrorCode, getApiErrorMessage } from '../services/http-client'

const UPCOMING = 'Sắp ra mắt'

/** "Mẹ Bảo Anh" → "BA": chữ cái đầu của hai từ cuối */
const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((word) => word.charAt(0))
    .join('')
    .toLocaleUpperCase('vi') || '?'

function Shell({ crumb, children }: { crumb?: ToyDetail; children: ReactNode }) {
  return (
    <AccountLayout activeItem="browse">
      <div className="catalog-page toy-detail">
        <nav aria-label="Breadcrumb" className="tf-breadcrumb">
          <Link to={PATHS.home} className="tf-breadcrumb__link">
            <Home aria-hidden /> Trang chủ
          </Link>
          <ChevronRight aria-hidden />
          <Link to={PATHS.toys} className="tf-breadcrumb__link">
            Tìm đồ chơi
          </Link>
          {crumb && (
            <>
              <ChevronRight aria-hidden />
              <Link
                to={`${PATHS.toys}?${toCatalogSearch({ categoryId: crumb.category.id, page: 1 })}`}
                className="tf-breadcrumb__link"
              >
                {crumb.category.name}
              </Link>
              <ChevronRight aria-hidden />
              <span aria-current="page" className="tf-breadcrumb__current">
                {crumb.title}
              </span>
            </>
          )}
        </nav>
        {children}
      </div>
    </AccountLayout>
  )
}

function SpecsCard({ toy }: { toy: ToyDetail }) {
  const isRent = toy.listingType === 'rent'
  const specs: Array<[string, string]> = [
    ['Độ tuổi phù hợp', formatAgeRange(toy.ageRange)],
    ['Danh mục', toy.category.name],
    ['Tình trạng', toy.condition],
    ['Hình thức', isRent ? 'Cho thuê theo ngày' : 'Bán lại'],
    ...(isRent && toy.depositPrice ? [['Tiền cọc', formatVnd(toy.depositPrice)] as [string, string]] : []),
    ['Ngày đăng', formatDate(toy.createdAt)],
  ]

  return (
    <section className="tf-card" aria-labelledby="specs-title">
      <h2 id="specs-title" className="tf-section-title tf-section-title--sm">
        Thông số
      </h2>
      <dl className="toy-specs">
        {specs.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/** Chỉ tab Mô tả có dữ liệu; đánh giá và chính sách thuê chưa có API nên hiện để biết sắp có */
function DetailTabs({ toy }: { toy: ToyDetail }) {
  return (
    <section className="tf-card detail-tabs">
      <div className="status-tabs detail-tabs__list" role="tablist" aria-label="Thông tin món đồ chơi">
        <button type="button" role="tab" aria-selected="true" aria-controls="tab-description" className="status-tab is-active">
          Mô tả
        </button>
        {['Đánh giá', 'Chính sách thuê & cọc'].map((label) => (
          <span key={label} className="status-tab is-unavailable" aria-disabled="true" title={UPCOMING}>
            {label}
            <span className="status-tab__count">Sắp có</span>
          </span>
        ))}
      </div>
      <div id="tab-description" role="tabpanel" className="detail-tabs__panel">
        <p className="toy-description">{toy.description}</p>
      </div>
    </section>
  )
}

function OwnerCard({ toy }: { toy: ToyDetail }) {
  return (
    <section className="tf-card owner-card" aria-label="Chủ đồ chơi">
      <span className="owner-card__avatar" aria-hidden>
        {initialsOf(toy.owner.displayName)}
      </span>
      <div className="owner-card__text">
        <span className="tf-caption">Chủ đồ chơi</span>
        <strong className="owner-card__name">{toy.owner.displayName}</strong>
      </div>
      <button type="button" className="tf-btn tf-btn--soft tf-btn--inline owner-card__chat" disabled title={UPCOMING}>
        <MessageCircle aria-hidden />
        Nhắn tin
      </button>
    </section>
  )
}

function BuyCard({ toy }: { toy: ToyDetail }) {
  return (
    <section className="tf-card booking-card" aria-label="Mua lại">
      <p className="booking-card__price">
        <strong>{formatVnd(toy.priceOrRate)}</strong>
      </p>
      <p className="booking-card__row">
        <span>Tình trạng</span>
        <strong>{toy.condition}</strong>
      </p>
      <button type="button" className="tf-btn tf-btn--primary" disabled aria-describedby="buy-note">
        <ShoppingBag aria-hidden />
        Mua món này
      </button>
      <p id="buy-note" className="booking-card__note">
        Đặt mua trực tuyến sắp ra mắt. Giá ở trên là giá chủ đồ chơi đăng.
      </p>
    </section>
  )
}

function DetailSkeleton() {
  return (
    <div className="toy-detail__layout" aria-busy="true" aria-label="Đang tải món đồ chơi">
      <div className="toy-detail__main">
        <div className="skeleton-block toy-detail__skeleton-media" />
      </div>
      <div className="toy-detail__side">
        <div className="tf-card">
          <span className="skeleton-line" style={{ width: '25%' }} />
          <span className="skeleton-line skeleton-line--xl" style={{ width: '85%' }} />
          <span className="skeleton-line skeleton-line--lg" style={{ width: '45%' }} />
        </div>
      </div>
    </div>
  )
}

export function ToyDetailPage() {
  const { toyId = '' } = useParams()
  const detail = useQuery(toyDetailQuery(toyId))
  const toy = detail.data

  useEffect(() => {
    document.title = toy ? `${toy.title} | ToyFlow` : 'Đồ chơi | ToyFlow'
  }, [toy])

  if (detail.isPending) {
    return (
      <Shell>
        <DetailSkeleton />
      </Shell>
    )
  }

  if (detail.isError) {
    const code = getApiErrorCode(detail.error)
    const notFound = code === 'NOT_FOUND' || code === 'INVALID_TOY_ID'
    return (
      <Shell>
        <div className="tf-card load-state" role="alert">
          <p className="tf-section-title tf-section-title--md">
            {notFound ? 'Món đồ chơi này không còn trên ToyFlow.' : 'Chưa tải được món đồ chơi.'}
          </p>
          <p>
            {notFound
              ? 'Có thể chủ đồ chơi đã ẩn tin hoặc món đồ đã được bán.'
              : getApiErrorMessage(detail.error)}
          </p>
          {notFound ? (
            <Link to={PATHS.toys} className="tf-btn tf-btn--primary tf-btn--inline">
              Xem các món khác
            </Link>
          ) : (
            <button type="button" className="tf-btn tf-btn--soft tf-btn--inline" onClick={() => void detail.refetch()}>
              Thử lại
            </button>
          )}
        </div>
      </Shell>
    )
  }

  const data = detail.data
  const isRent = data.listingType === 'rent'
  const badge = <span className={`toy-detail__badge toy-detail__badge--${data.listingType}`}>{isRent ? 'Cho thuê' : 'Bán lại'}</span>

  return (
    <Shell crumb={data}>
      <div className="toy-detail__layout">
        <div className="toy-detail__main">
          <ToyGallery images={data.images} title={data.title} badge={badge} />
          <SpecsCard toy={data} />
          <DetailTabs toy={data} />
        </div>

        <aside className="toy-detail__side" aria-label="Thông tin chính">
          <header className="toy-detail__head">
            <span className={`tf-pill ${isRent ? 'tf-pill--primary' : 'tf-pill--secondary'}`}>
              {isRent ? 'Cho thuê' : 'Bán lại'}
            </span>
            <h1 className="toy-detail__title">{data.title}</h1>
            <div className="toy-detail__actions">
              <button type="button" className="toy-detail__action" disabled title={UPCOMING}>
                <Bookmark aria-hidden /> Lưu
              </button>
              <button type="button" className="toy-detail__action" disabled title={UPCOMING}>
                <Flag aria-hidden /> Báo cáo
              </button>
            </div>
          </header>

          <OwnerCard toy={data} />
          <div id="dat-thue">{isRent ? <RentalBookingCard toy={data} /> : <BuyCard toy={data} />}</div>
        </aside>
      </div>

      <SimilarToys toy={data} />

      {/* Màn hẹp, tin cho thuê: giá và lối tới lịch đặt thuê luôn trong tầm tay */}
      {isRent && (
        <div className="toy-detail__bar">
          <p className="toy-detail__bar-price">
            {formatVnd(data.priceOrRate)}
            <span> / ngày</span>
          </p>
          <a href="#dat-thue" className="tf-btn tf-btn--primary tf-btn--inline">
            Chọn ngày thuê
          </a>
        </div>
      )}
    </Shell>
  )
}
