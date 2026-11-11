import type { Tone } from './home-content'

/**
 * Class Tailwind dùng lại ở nhiều component của trang chủ (nút, link, skeleton, tone màu).
 * Không trộn hai class cùng thuộc tính trong một chuỗi (vd. rounded-xl và rounded-full):
 * thứ tự ưu tiên của utility do Tailwind quyết định, không theo thứ tự viết.
 */

const BUTTON_BASE =
  'inline-flex cursor-pointer items-center justify-center gap-2 text-sm font-semibold whitespace-nowrap transition-[background-color,color,box-shadow,transform] duration-200 ease-out-quint focus-ring active:scale-[0.98] [&_svg]:size-4'

const BUTTON_VARIANTS = {
  primary: 'bg-site-primary text-white hover:bg-site-primary-hover hover:shadow-[0_8px_20px_-10px_rgb(20_40_75/0.8)]',
  navy: 'bg-tf-primary text-white hover:bg-tf-primary-container dark:bg-indigo-300 dark:text-night-950 dark:hover:bg-indigo-200',
  outline:
    'border border-site-line bg-white text-site-ink hover:border-site-primary hover:text-site-primary dark:border-night-700 dark:bg-night-800 dark:text-slate-100',
  light: 'bg-white text-site-donate hover:bg-tf-secondary-container',
  ghostLight: 'border border-white/40 text-white hover:bg-white/10',
} as const

const BUTTON_SIZES = {
  md: 'rounded-xl px-5 py-3',
  small: 'rounded-lg px-4 py-2',
  /** Cỡ md nhưng bo tròn hẳn (nút "Xem thêm") */
  pill: 'rounded-full px-5 py-3',
} as const

export type HomeButtonVariant = keyof typeof BUTTON_VARIANTS

export const homeButton = (variant: HomeButtonVariant, size: keyof typeof BUTTON_SIZES = 'md') =>
  `${BUTTON_BASE} ${BUTTON_SIZES[size]} ${BUTTON_VARIANTS[variant]}`

/** Link chữ kèm mũi tên, mũi tên nhích sang phải khi rê chuột ("Xem tất cả") */
export const HOME_LINK =
  'inline-flex shrink-0 items-center gap-1 rounded text-sm font-semibold text-site-primary hover:underline focus-ring dark:text-indigo-300 [&_svg]:size-4 [&_svg]:transition-transform [&_svg]:duration-300 [&_svg]:ease-out-quint hover:[&_svg]:translate-x-0.5'

/** Lưới thẻ đồ chơi 2 → 3 → 4 → 5 cột — số cột PHẢI khớp hooks/use-grid-columns.ts */
export const TOY_GRID = 'grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'

/** Khối nhấp nháy khi đang tải — bo góc thêm tuỳ chỗ dùng */
export const SKELETON = 'animate-pulse bg-tf-surface/70 dark:bg-night-800'

/** Nền nhạt + chữ đậm cùng sắc độ cho icon, ô ảnh chờ và nhãn */
export const TONE_CLASSES: Record<Tone, string> = {
  sky: 'bg-tf-primary-fixed text-tf-primary dark:bg-sky-400/10 dark:text-sky-300',
  indigo: 'bg-tf-primary-fixed text-tf-primary dark:bg-indigo-400/10 dark:text-indigo-300',
  rose: 'bg-tf-error-container text-tf-error dark:bg-rose-400/10 dark:text-rose-300',
  emerald: 'bg-tf-secondary-container text-tf-secondary dark:bg-emerald-400/10 dark:text-emerald-300',
  amber: 'bg-tf-tertiary-fixed text-tf-tertiary dark:bg-amber-400/10 dark:text-amber-300',
  violet: 'bg-tf-primary-fixed text-tf-primary dark:bg-violet-400/10 dark:text-violet-300',
  cyan: 'bg-tf-primary-fixed text-tf-primary dark:bg-cyan-400/10 dark:text-cyan-300',
  orange: 'bg-tf-tertiary-fixed text-tf-tertiary dark:bg-orange-400/10 dark:text-orange-300',
  blue: 'bg-tf-primary-fixed text-tf-primary dark:bg-blue-400/10 dark:text-blue-300',
  lime: 'bg-tf-primary-fixed text-tf-primary dark:bg-lime-400/10 dark:text-lime-300',
  fuchsia: 'bg-tf-primary-fixed text-tf-primary dark:bg-fuchsia-400/10 dark:text-fuchsia-300',
  slate: 'bg-tf-surface-low text-tf-ink-muted dark:bg-slate-400/10 dark:text-slate-300',
}
