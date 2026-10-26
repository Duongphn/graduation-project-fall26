import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState, type FocusEvent, type PointerEvent } from 'react'
import { Link } from 'react-router-dom'
import { usePrefersReducedMotion } from '../../../hooks/use-prefers-reduced-motion'
import type { HeroBannerSlide } from '../home-content'

const AUTOPLAY_MS = 5_000
/** Vuốt ngang tối thiểu (px) để tính là chuyển slide */
const SWIPE_THRESHOLD_PX = 40

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
      className="hero-banner"
      aria-roledescription="carousel"
      aria-label={label}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={handleBlur}
    >
      <div className="hero-banner__viewport" onPointerDown={handlePointerDown} onPointerUp={handlePointerUp}>
        <div className="hero-banner__track" style={{ transform: `translateX(-${activeIndex * 100}%)` }}>
          {slides.map((slide, index) => (
            <BannerSlide key={slide.id} slide={slide} position={index + 1} total={count} isActive={index === activeIndex} />
          ))}
        </div>
      </div>

      {count > 1 && (
        <div className="hero-banner__controls">
          <button type="button" className="hero-banner__arrow" aria-label="Banner trước" onClick={() => goTo(activeIndex - 1)}>
            <ChevronLeft aria-hidden />
          </button>
          <div className="hero-banner__dots">
            {slides.map((slide, index) => (
              <button
                key={slide.id}
                type="button"
                className={`hero-banner__dot ${index === activeIndex ? 'is-active' : ''}`}
                aria-label={`Banner ${index + 1}: ${slide.eyebrow}`}
                aria-current={index === activeIndex}
                onClick={() => goTo(index)}
              />
            ))}
          </div>
          <button type="button" className="hero-banner__arrow" aria-label="Banner sau" onClick={() => goTo(activeIndex + 1)}>
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
      className={`hero-banner__slide hero-banner__slide--${slide.tone}`}
      role="group"
      aria-roledescription="slide"
      aria-label={`${position} / ${total}: ${slide.eyebrow}`}
      aria-hidden={!isActive}
      // Slide đang ẩn không nhận focus bằng Tab
      inert={!isActive}
    >
      <div className="hero-banner__media" aria-hidden={!slide.image}>
        {slide.image ? (
          <img
            src={slide.image.src}
            alt={slide.image.alt}
            className="hero-banner__image"
            // Slide đầu hiện ngay khi vào trang → tải ngay, ưu tiên cao; các slide sau tải lười
            loading={position === 1 ? 'eager' : 'lazy'}
            fetchPriority={position === 1 ? 'high' : 'auto'}
            decoding="async"
          />
        ) : (
          <span className="hero-banner__illustration">
            <Icon />
          </span>
        )}
      </div>

      <div className="hero-banner__body">
        <p className="hero-banner__eyebrow">{slide.eyebrow}</p>
        <h2 className="hero-banner__title">{slide.title}</h2>
        <p className="hero-banner__text">{slide.description}</p>
        <ul className="hero-banner__highlights">
          {slide.highlights.map((highlight) => (
            <li key={highlight}>{highlight}</li>
          ))}
        </ul>
        <Link to={slide.to} className="hero-banner__cta">
          {slide.ctaLabel} <ArrowRight aria-hidden />
        </Link>
      </div>
    </article>
  )
}
