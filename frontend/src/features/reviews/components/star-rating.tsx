import { Star } from 'lucide-react'
import { useId, useState, type KeyboardEvent } from 'react'
import { RATING_WORDS, type RatingSummary } from '../reviews-api'

const STARS = [1, 2, 3, 4, 5] as const

/** Hiển thị sao (chỉ đọc). Sao lẻ được tô một phần bằng độ rộng lớp phủ */
export function StarRating({ value, size = 'md' }: { value: number; size?: 'sm' | 'md' }) {
  const percent = Math.max(0, Math.min(5, value)) * 20
  return (
    <span className={`star-rating star-rating--${size}`} role="img" aria-label={`${value} trên 5 sao`}>
      <span className="star-rating__base" aria-hidden>
        {STARS.map((n) => (
          <Star key={n} />
        ))}
      </span>
      <span className="star-rating__fill" style={{ width: `${percent}%` }} aria-hidden>
        {STARS.map((n) => (
          <Star key={n} />
        ))}
      </span>
    </span>
  )
}

/** "4,5 ★ (12 đánh giá)" — tin chưa có ai chấm thì nói rõ, không hiện 0 sao */
export function RatingSummaryText({ rating, compact = false }: { rating?: RatingSummary; compact?: boolean }) {
  if (!rating || rating.average === null || rating.count === 0) {
    return compact ? null : <span className="rating-summary rating-summary--empty">Chưa có đánh giá</span>
  }
  return (
    <span className="rating-summary">
      <Star className="rating-summary__star" aria-hidden />
      <strong>{rating.average.toFixed(1).replace('.', ',')}</strong>
      <span className="rating-summary__count">
        ({rating.count}
        {compact ? '' : ' đánh giá'})
      </span>
      {compact && <span className="sr-only"> đánh giá</span>}
    </span>
  )
}

interface StarInputProps {
  label: string
  value: number
  onChange: (value: number) => void
  disabled?: boolean
  error?: string | null
}

/**
 * Chọn 1–5 sao: nhóm radio thật (bàn phím mũi tên, trình đọc màn hình đọc được), rê chuột xem trước mức sao.
 */
export function StarInput({ label, value, onChange, disabled, error }: StarInputProps) {
  const id = useId()
  const [hover, setHover] = useState(0)
  const shown = hover || value

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault()
      onChange(Math.min(5, (value || 0) + 1))
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault()
      onChange(Math.max(1, (value || 2) - 1))
    }
  }

  return (
    <div className="star-input">
      <span id={`${id}-label`} className="star-input__label">
        {label}
      </span>
      <div className="star-input__row">
        <div
          role="radiogroup"
          aria-labelledby={`${id}-label`}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className="star-input__stars"
          onMouseLeave={() => setHover(0)}
          onKeyDown={onKeyDown}
        >
          {STARS.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              aria-label={`${n} sao, ${RATING_WORDS[n]}`}
              // Chỉ sao đang chọn (hoặc sao đầu khi chưa chọn) nằm trong thứ tự Tab
              tabIndex={value === n || (value === 0 && n === 1) ? 0 : -1}
              disabled={disabled}
              className={`star-input__star ${n <= shown ? 'is-on' : ''}`}
              onMouseEnter={() => setHover(n)}
              onFocus={() => setHover(0)}
              onClick={() => onChange(n)}
            >
              <Star aria-hidden />
            </button>
          ))}
        </div>
        <span className="star-input__word" aria-live="polite">
          {shown ? RATING_WORDS[shown] : 'Chọn số sao'}
        </span>
      </div>
      {error && (
        <p id={`${id}-error`} className="star-input__error">
          {error}
        </p>
      )}
    </div>
  )
}
