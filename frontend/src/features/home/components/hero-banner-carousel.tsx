import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState, type FocusEvent, type PointerEvent } from 'react'
import { Link } from 'react-router-dom'
import { usePrefersReducedMotion } from '../../../hooks/use-prefers-reduced-motion'
import type { HeroBannerSlide } from '../home-content'

const AUTOPLAY_MS = 5_000
/** Vuốt ngang tối thiểu (px) để tính là chuyển slide */
const SWIPE_THRESHOLD_PX = 40

/** Màu nền ô ảnh và màu dòng chữ nhỏ trên cùng theo tông của slide */
const SLIDE_TONES: Record<HeroBannerSlide['tone'], { media: string; eyebrow: string }> = {
  sky: {
    media:
      'bg-gradient-to-br from-tf-primary-fixed via-tf-primary-fixed to-tf-primary-fixed text-tf-primary dark:from-sky-400/20 dark:via-night-900 dark:to-indigo-400/15 dark:text-sky-300',
    eyebrow: 'text-tf-primary dark:text-sky-300',
  },
  orange: {
    media:
      'bg-gradient-to-br from-tf-tertiary-fixed via-tf-tertiary-fixed to-tf-error-container text-tf-tertiary dark:from-orange-400/20 dark:via-night-900 dark:to-rose-400/15 dark:text-orange-300',
    eyebrow: 'text-tf-tertiary dark:text-orange-300',
  },
  emerald: {
    media:
      'bg-gradient-to-br from-tf-secondary-container via-tf-secondary-container to-tf-primary-fixed text-tf-secondary dark:from-emerald-400/20 dark:via-night-900 dark:to-lime-400/15 dark:text-emerald-300',
    eyebrow: 'text-tf-secondary dark:text-emerald-300',
  },
}

const ARROW_BUTTON =
  'grid size-9 cursor-pointer place-items-center rounded-full bg-white/10 text-white ring-1 ring-white/20 transition-colors hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none [&_svg]:size-4'

interface HeroBannerCarouselProps {
  slides: HeroBannerSlide[]
  label: string
}

/**
 * Banner tự trượt: 5 giây một slide, dừng khi rê chuột / focus vào banner hoặc khi người dùng bật
 * "giảm chuyển động". Điều khiển được bằng nút trước/sau, chấm chỉ mục, vuốt (cảm ứng) và bàn phím.
 */
export function HeroBannerCarousel({ slides, label }: HeroBannerCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const prefersReducedMotion = usePrefersReducedMotion()
  const swipeStartX = useRef<number | null>(null)
  const count = slides.length

  const goTo = (index: number) => setActiveIndex(((index % count) + count) % count)

  // Hẹn giờ lại sau mỗi lần đổi slide → bấm tay xong cũng đủ 5 giây mới tự chạy tiếp
  useEffect(() => {
    if (isPaused || prefersReducedMotion || count < 2) return
    const timer = window.setTimeout(() => setActiveIndex((index) => (index + 1) % count), AUTOPLAY_MS)
    return () => window.clearTimeout(timer)
  }, [activeIndex, isPaused, prefersReducedMotion, count])

  const handlePointerDown = (event: PointerEvent) => {
    swipeStartX.current = event.clientX
  }

  const handlePointerUp = (event: PointerEvent) => {
    if (swipeStartX.current === null) return
    const deltaX = event.clientX - swipeStartX.current
    swipeStartX.current = null
    if (Math.abs(deltaX) >= SWIPE_THRESHOLD_PX) goTo(activeIndex + (deltaX < 0 ? 1 : -1))
  }

  // Chỉ chạy lại khi focus rời hẳn khỏi banner (không phải chuyển giữa các nút bên trong)
  const handleBlur = (event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setIsPaused(false)
  }

  if (count === 0) return null

  return (
    <section
      className="relative w-full max-w-md animate-rise-in [animation-delay:120ms] lg:ml-auto"
      aria-roledescription="carousel"
      aria-label={label}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={handleBlur}
    >
      <div
        className="touch-pan-y overflow-hidden rounded-3xl shadow-[0_30px_60px_-25px_rgb(18_23_31/0.55)] select-none"
        onPointerDown={handlePointerDown} onPointerUp={handlePointerUp}>
        <div
          className="flex transition-transform duration-700 ease-out-quint motion-reduce:transition-none"
          style={{ transform: `translateX(-${activeIndex * 100}%)` }}>
          {slides.map((slide, index) => (
            <BannerSlide key={slide.id} slide={slide} position={index + 1} total={count} isActive={index === activeIndex} />
          ))}
        </div>
      </div>

      {count > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <button type="button" className={ARROW_BUTTON} aria-label="Banner trước" onClick={() => goTo(activeIndex - 1)}>
            <ChevronLeft aria-hidden />
          </button>
          <div className="flex items-center gap-2">
            {slides.map((slide, index) => (
              <button
                key={slide.id}
                type="button"
                // Vùng bấm 24px (đủ lớn cho cảm ứng), chấm hiển thị nhỏ bên trong (::before)
                className={`relative h-6 w-6 cursor-pointer rounded-full before:absolute before:top-1/2 before:left-1/2 before:h-2 before:w-5 before:-translate-1/2 before:rounded-full before:transition-[clip-path,background-color] before:duration-300 before:ease-out-quint before:content-[''] focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none ${
                  index === activeIndex
                    ? 'before:bg-white before:[clip-path:inset(0_0_round_4px)]'
                    : 'before:bg-white/40 before:[clip-path:inset(0_6px_round_4px)]'
                }`}
                aria-label={`Banner ${index + 1}: ${slide.eyebrow}`}
                aria-current={index === activeIndex}
                onClick={() => goTo(index)}
              />
            ))}
          </div>
          <button type="button" className={ARROW_BUTTON} aria-label="Banner sau" onClick={() => goTo(activeIndex + 1)}>
            <ChevronRight aria-hidden />
          </button>
        </div>
      )}
    </section>
  )
}

interface BannerSlideProps {
  slide: HeroBannerSlide
  position: number
  total: number
  isActive: boolean
}

function BannerSlide({ slide, position, total, isActive }: BannerSlideProps) {
  const { icon: Icon } = slide

  return (
    <article
      className="flex w-full shrink-0 flex-col bg-white text-site-ink dark:bg-night-900 dark:text-white"
      role="group"
      aria-roledescription="slide"
      aria-label={`${position} / ${total}: ${slide.eyebrow}`}
      aria-hidden={!isActive}
      // Slide đang ẩn không nhận focus bằng Tab
      inert={!isActive}
    >
      <div
        className={`relative grid aspect-[16/9] place-items-center overflow-hidden ${SLIDE_TONES[slide.tone].media}`}
        aria-hidden={!slide.image}
      >
        {slide.image ? (
          <img
            src={slide.image.src}
            alt={slide.image.alt}
            // Phủ kín khung 16:9 (cắt phần thừa): slide nào cũng cao bằng nhau
            className="absolute inset-0 size-full object-cover"
            // Slide đầu hiện ngay khi vào trang → tải ngay, ưu tiên cao; các slide sau tải lười
            loading={position === 1 ? 'eager' : 'lazy'}
            fetchPriority={position === 1 ? 'high' : 'auto'}
            decoding="async"
          />
        ) : (
          <span className="relative grid size-24 place-items-center rounded-[28px] bg-white/80 shadow-[0_18px_40px_-18px_rgb(18_23_31/0.45)] ring-8 ring-white/40 dark:bg-white/10 dark:ring-white/5 [&_svg]:size-11">
            <Icon />
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2 p-5 sm:p-6">
        <p className={`text-xs font-semibold tracking-[0.1em] uppercase ${SLIDE_TONES[slide.tone].eyebrow}`}>{slide.eyebrow}</p>
        <h2 className="text-xl leading-7 font-bold tracking-[-0.01em]">{slide.title}</h2>
        <p className="text-sm leading-6 text-site-muted dark:text-slate-400">{slide.description}</p>
        <ul className="mt-1 flex flex-wrap gap-2">
          {slide.highlights.map((highlight) => (
            <li
              key={highlight}
              className="rounded-full bg-tf-surface-low px-2.5 py-1 text-xs font-medium text-tf-ink-muted dark:bg-night-800 dark:text-slate-300"
            >
              {highlight}
            </li>
          ))}
        </ul>
        <Link
          to={slide.to}
          className="mt-2 inline-flex items-center gap-1 self-start rounded text-sm font-semibold text-site-primary hover:underline focus-ring dark:text-indigo-300 [&_svg]:size-4 [&_svg]:transition-transform [&_svg]:duration-300 [&_svg]:ease-out-quint hover:[&_svg]:translate-x-0.5"
        >
          {slide.ctaLabel} <ArrowRight aria-hidden />
        </Link>
      </div>
    </article>
  )
}
