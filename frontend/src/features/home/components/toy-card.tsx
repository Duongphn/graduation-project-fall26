import { MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toyDetailPath } from '../../../routes/paths'
import { FavoriteButton } from '../../favorites/components/favorite-button'
import { formatVnd } from '../../toy-listings/format-vnd'
import type { HomeCategory, PublicToy } from '../home-api'
import { SKELETON } from '../home-styles'
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

/** Khung thẻ dùng chung cho thẻ thật, thẻ skeleton và thẻ khung mờ (toy-grid-empty) */
export const TOY_CARD_FRAME =
  'relative flex min-w-0 flex-col gap-3 rounded-2xl border border-site-line p-2.5 transition-[border-color,box-shadow,transform] duration-300 ease-out-quint dark:border-night-700'

export const TOY_CARD_MEDIA = 'relative grid aspect-[4/3] place-items-center overflow-hidden rounded-xl'

/** py-[14px]: khoảng đệm dọc trước đây đến từ rule `.toy-card__body` của trang tìm kiếm — giữ để thẻ không đổi */
export const TOY_CARD_BODY = 'flex flex-1 flex-col gap-1 px-1 py-[14px]'

/**
 * Nhãn loại tin. Nhãn "Bán lại" không có nền: trước đây rule `.toy-card--sell .toy-card__badge`
 * của trang tìm kiếm xoá nền trắng của nhãn — giữ nguyên để giao diện không đổi.
 */
const BADGE_CLASSES: Record<PublicToy['listingType'], string> = {
  rent: 'bg-white/95 text-tf-primary dark:bg-night-900/90 dark:text-sky-300',
  sell: 'text-site-sale dark:text-orange-300',
  donate: 'bg-white/95 text-tf-secondary dark:bg-night-900/90',
}

const PRICE_CLASSES: Record<PublicToy['listingType'], string> = {
  rent: 'text-site-primary dark:text-indigo-300',
  sell: 'text-site-sale dark:text-orange-300',
  donate: 'text-site-primary dark:text-indigo-300',
}

/** Thẻ đồ chơi dùng chung cho mục thuê, bán lại và quyên góp — cả thẻ bấm được nhờ link phủ (stretched link) */
export function ToyCard({ toy, category }: ToyCardProps) {
  const isRent = toy.listingType === 'rent'

  return (
    <article
      className={`${TOY_CARD_FRAME} bg-white hover:-translate-y-0.5 hover:border-site-primary/30 hover:shadow-[0_18px_36px_-26px_rgb(18_23_31/0.55)] focus-within:ring-2 focus-within:ring-site-primary dark:bg-night-900 dark:hover:border-site-primary/30`}
    >
      <div className={TOY_CARD_MEDIA}>
        <ToyMedia imageUrl={toy.images[0]?.url} alt={toy.title} category={category} />
        <span
          className={`absolute top-2 left-2 rounded-md px-2 py-0.5 text-[11px] font-semibold shadow-sm ${BADGE_CLASSES[toy.listingType]}`}
        >
          {LISTING_TYPE_LABELS[toy.listingType]}
        </span>
        {/* z-10: nằm trên link phủ thẻ nên bấm ♡ không mở trang chi tiết */}
        <FavoriteButton toyId={toy.id} toyTitle={toy.title} className="absolute top-2 right-2 z-10" />
      </div>

      <div className={TOY_CARD_BODY}>
        {/* min-h 2 dòng từ 600px + tracking: trước đây đến từ `.toy-card__title` của trang tìm kiếm */}
        <h3 className="line-clamp-2 text-sm leading-5 font-medium tracking-[-0.01em] text-site-ink min-[600px]:min-h-[2.8em] dark:text-white">
          {/* Link phủ cả thẻ (::after): bấm vào bất kỳ đâu trên thẻ đều mở chi tiết */}
          <Link
            to={toyDetailPath(toy.id)}
            // Lưới dùng để focus vào thẻ đầu tiên của lượt "Xem thêm"
            data-toy-link
            className="flex h-full flex-col overflow-hidden after:absolute after:inset-0 after:rounded-2xl after:content-[''] hover:-translate-y-px focus:outline-none"
          >
            {toy.title}
          </Link>
        </h3>

        <p
          className={`mt-1 flex items-baseline gap-0.5 text-base font-bold tabular-nums ${PRICE_CLASSES[toy.listingType]}`}
        >
          {toy.listingType === 'donate' ? 'Miễn phí' : formatVnd(toy.priceOrRate)}
          {isRent && <span className="text-xs font-normal text-site-muted"> /ngày</span>}
        </p>
        {isRent && toy.depositPrice !== undefined && (
          <p className="text-xs text-site-muted tabular-nums">Cọc {formatVnd(toy.depositPrice)}</p>
        )}
        {toy.district && (
          <p className="mt-1 flex min-w-0 items-center gap-1 text-xs text-site-muted dark:text-slate-400">
            <MapPin className="size-3.5 shrink-0 text-tf-error dark:text-rose-400" aria-hidden />
            <span className="sr-only">Khu vực: </span>
            <span className="truncate">{toy.district}</span>
          </p>
        )}
      </div>

      <dl className="mx-1 flex justify-between gap-2 border-t border-site-line pt-2.5 pb-1 text-[11px] text-site-muted dark:border-night-700 [&>div]:min-w-0 [&>div]:truncate">
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
    <div className={`${TOY_CARD_FRAME} overflow-hidden bg-white dark:bg-night-900`} aria-hidden>
      <div className={`${TOY_CARD_MEDIA} ${SKELETON}`} />
      <div className={TOY_CARD_BODY}>
        <span className={`${SKELETON} block h-3.5 w-full rounded-full`} />
        <span className={`${SKELETON} block h-3.5 w-1/2 rounded-full`} />
      </div>
    </div>
  )
}
