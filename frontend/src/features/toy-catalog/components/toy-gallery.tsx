import { ChevronLeft, ChevronRight, ToyBrick } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import type { ToyImage } from '../../toy-listings/toy-listing-api'

interface ToyGalleryProps {
  images: ToyImage[]
  title: string
  /** Nhãn góc trái ảnh (vd. "Cho thuê") */
  badge?: ReactNode
}

/**
 * Một dải ảnh scroll-snap dùng cho mọi màn: mobile vuốt ngang, desktop bấm mũi tên hoặc thumbnail.
 * Chỉ số ảnh hiện tại suy ra từ vị trí cuộn nên mọi cách điều khiển luôn khớp nhau.
 */
export function ToyGallery({ images, title, badge }: ToyGalleryProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [current, setCurrent] = useState(0)

  if (images.length === 0) {
    return (
      <div className="toy-gallery">
        <div className="toy-gallery__viewport toy-gallery__viewport--empty">
          {badge}
          <ToyBrick aria-hidden />
          Chủ đồ chơi chưa đăng ảnh
        </div>
      </div>
    )
  }

  const syncIndex = () => {
    const track = trackRef.current
    if (track) setCurrent(Math.round(track.scrollLeft / track.clientWidth))
  }

  const goTo = (index: number) => {
    const track = trackRef.current
    if (!track) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    track.scrollTo({ left: index * track.clientWidth, behavior: reduceMotion ? 'auto' : 'smooth' })
  }

  const hasMany = images.length > 1

  return (
    <div className="toy-gallery">
      <div className="toy-gallery__viewport">
        <div
          ref={trackRef}
          className="toy-gallery__track"
          onScroll={syncIndex}
          role="region"
          aria-label={`Ảnh của ${title}`}
          tabIndex={0}
        >
          {images.map((image, index) => (
            <img
              key={image.publicId || image.url}
              src={image.url}
              alt={`${title}, ảnh ${index + 1} trên ${images.length}`}
              loading={index === 0 ? 'eager' : 'lazy'}
              decoding="async"
            />
          ))}
        </div>
        {badge}
        {hasMany && (
          <>
            <button
              type="button"
              className="toy-gallery__arrow toy-gallery__arrow--prev"
              aria-label="Ảnh trước"
              disabled={current === 0}
              onClick={() => goTo(current - 1)}
            >
              <ChevronLeft aria-hidden />
            </button>
            <button
              type="button"
              className="toy-gallery__arrow toy-gallery__arrow--next"
              aria-label="Ảnh sau"
              disabled={current === images.length - 1}
              onClick={() => goTo(current + 1)}
            >
              <ChevronRight aria-hidden />
            </button>
            <span className="toy-gallery__counter" aria-hidden="true">
              {current + 1} / {images.length}
            </span>
          </>
        )}
      </div>

      {hasMany && (
        <ul className="toy-gallery__thumbs">
          {images.map((image, index) => (
            <li key={image.publicId || image.url}>
              <button
                type="button"
                className="toy-gallery__thumb"
                aria-label={`Xem ảnh ${index + 1}`}
                aria-current={index === current}
                onClick={() => goTo(index)}
              >
                <img src={image.url} alt="" loading="lazy" decoding="async" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
