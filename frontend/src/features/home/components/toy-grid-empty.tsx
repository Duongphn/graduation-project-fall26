import { ArrowRight, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { homeButton, TOY_GRID } from '../home-styles'
import { TOY_CARD_BODY, TOY_CARD_FRAME, TOY_CARD_MEDIA } from './toy-card'

export interface ToyGridEmptyContent {
  icon: LucideIcon
  title: string
  description: string
  ctaLabel: string
  to: string
}

type Variant = 'rent' | 'sell' | 'donate'

interface ToyGridEmptyProps extends ToyGridEmptyContent {
  /** Số thẻ khung mờ phía sau (1 hàng) — chỉ để giữ nhịp bố cục, không phải dữ liệu */
  ghostCount: number
  variant: Variant
}

const GHOST_MEDIA_CLASSES: Record<Variant, string> = {
  rent: 'bg-tf-primary-fixed dark:bg-sky-400/10',
  sell: 'bg-tf-tertiary-fixed dark:bg-orange-400/10',
  donate: 'bg-tf-surface-low dark:bg-night-800',
}

/** Quyên góp không có màu riêng: icon không có nền (như trước) */
const ICON_CLASSES: Record<Variant, string> = {
  rent: 'bg-tf-primary-fixed text-tf-primary dark:bg-sky-400/10 dark:text-sky-300',
  sell: 'bg-tf-tertiary-fixed text-tf-tertiary dark:bg-orange-400/10 dark:text-orange-300',
  donate: '',
}

const GHOST_LINE = 'block h-3 rounded-full bg-tf-surface-low dark:bg-night-800'

/** Trạng thái chưa có tin: hàng thẻ khung mờ (trang trí) + lời mời đăng tin ở giữa */
export function ToyGridEmpty({ icon: Icon, title, description, ctaLabel, to, ghostCount, variant }: ToyGridEmptyProps) {
  return (
    <div className="relative">
      {/* Chỉ giữ 1 hàng thẻ khung, mờ dần xuống dưới */}
      <div
        className={`${TOY_GRID} max-h-72 overflow-hidden [mask-image:linear-gradient(to_bottom,rgb(18_23_31/0.55),transparent_92%)]`}
        aria-hidden
      >
        {Array.from({ length: ghostCount }, (_, index) => (
          <div
            key={index}
            className={`${TOY_CARD_FRAME} border-dashed bg-white/70 hover:-translate-y-0.5 hover:border-site-primary/30 hover:shadow-[0_18px_36px_-26px_rgb(18_23_31/0.55)] dark:bg-night-900/60 dark:hover:border-site-primary/30`}
          >
            <div className={`${TOY_CARD_MEDIA} ${GHOST_MEDIA_CLASSES[variant]}`} />
            <div className={TOY_CARD_BODY}>
              <span className={`${GHOST_LINE} w-full`} />
              <span className={`${GHOST_LINE} w-1/2`} />
            </div>
          </div>
        ))}
      </div>

      <div className="absolute inset-x-0 top-1/2 mx-auto flex w-[min(100%-2rem,26rem)] -translate-y-1/2 flex-col items-center gap-2 rounded-2xl bg-white/95 px-6 py-6 text-center shadow-[0_20px_50px_-24px_rgb(18_23_31/0.45)] backdrop-blur-sm dark:bg-night-900/95">
        <span
          className={`mb-1 grid size-12 place-items-center rounded-2xl [&_svg]:size-6 ${ICON_CLASSES[variant]}`}
          aria-hidden
        >
          <Icon />
        </span>
        <p className="font-semibold text-site-ink dark:text-white">{title}</p>
        <p className="text-sm leading-6 text-site-muted dark:text-slate-400">{description}</p>
        <Link to={to} className={`${homeButton('navy', 'small')} mt-2`}>
          {ctaLabel} <ArrowRight aria-hidden />
        </Link>
      </div>
    </div>
  )
}
