import { useQuery } from '@tanstack/react-query'
import dayjs, { type Dayjs } from 'dayjs'
import { CalendarDays, ChevronLeft, ChevronRight, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { getApiErrorMessage } from '../../../services/http-client'
import { formatVnd } from '../../toy-listings/format-vnd'
import type { ToyDetail } from '../toy-catalog-api'
import { toyAvailabilityQuery } from '../toy-catalog-queries'

const DATE_KEY = 'YYYY-MM-DD'
/** Backend chỉ trả lịch trong tối đa 180 ngày tính từ hôm nay */
const WINDOW_DAYS = 180
const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
const dayLabel = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' })

type DayStatus = 'past' | 'free' | 'booked' | 'outside'

const STATUS_TEXT: Record<DayStatus, string> = {
  past: 'đã qua',
  free: 'còn trống',
  booked: 'đã có người thuê',
  outside: 'chưa mở lịch',
}

interface Range {
  start: Dayjs | null
  end: Dayjs | null
}

/**
 * Thẻ đặt thuê: lịch một tháng để chọn ngày nhận → ngày trả, rồi tạm tính chi phí từ giá thật.
 * Lịch tải một lần cả cửa sổ 180 ngày để kiểm tra khoảng chọn không vắt qua ngày đã có người thuê,
 * kể cả khi khoảng đó kéo sang tháng khác.
 * Gửi yêu cầu thuê và mã giảm giá chưa có API (server/src/features/rental_orders, vouchers) nên đang khoá.
 */
export function RentalBookingCard({ toy }: { toy: ToyDetail }) {
  const [today] = useState(() => dayjs().startOf('day'))
  const lastOpenDay = today.add(WINDOW_DAYS - 1, 'day')
  const maxOffset = lastOpenDay.startOf('month').diff(today.startOf('month'), 'month')
  const [offset, setOffset] = useState(0)
  const [range, setRange] = useState<Range>({ start: null, end: null })

  const availability = useQuery(toyAvailabilityQuery(toy.id, today.format(DATE_KEY), lastOpenDay.format(DATE_KEY)))

  const booked = new Set<string>()
  for (const period of availability.data ?? []) {
    for (let day = dayjs(period.startDate); !day.isAfter(dayjs(period.endDate)); day = day.add(1, 'day')) {
      booked.add(day.format(DATE_KEY))
    }
  }

  const statusOf = (date: Dayjs): DayStatus => {
    if (date.isBefore(today)) return 'past'
    if (date.isAfter(lastOpenDay)) return 'outside'
    return booked.has(date.format(DATE_KEY)) ? 'booked' : 'free'
  }

  const rangeIsFree = (start: Dayjs, end: Dayjs) => {
    for (let day = start; !day.isAfter(end); day = day.add(1, 'day')) {
      if (booked.has(day.format(DATE_KEY))) return false
    }
    return true
  }

  /** Bấm lần 1 chọn ngày nhận, lần 2 chọn ngày trả; khoảng vướng ngày đã thuê thì bắt đầu lại từ ngày vừa bấm */
  const pick = (date: Dayjs) => {
    setRange(({ start, end }) => {
      if (!start || end || date.isBefore(start) || !rangeIsFree(start, date)) return { start: date, end: null }
      return { start, end: date }
    })
  }

  const month = today.startOf('month').add(offset, 'month')
  const leadingBlanks = (month.day() + 6) % 7 // tuần bắt đầu từ thứ Hai
  const days = range.start && range.end ? range.end.diff(range.start, 'day') + 1 : 0
  const rentTotal = days * toy.priceOrRate
  const deposit = toy.depositPrice ?? 0

  return (
    <section className="tf-card booking-card" aria-labelledby="booking-title">
      <p className="booking-card__price">
        <strong>{formatVnd(toy.priceOrRate)}</strong>
        <span>/ ngày</span>
      </p>
      {deposit > 0 && (
        <p className="booking-card__row">
          <span>Tiền cọc (hoàn lại khi trả đồ)</span>
          <strong>{formatVnd(deposit)}</strong>
        </p>
      )}

      <div className="booking-card__calendar">
        <div className="booking-card__calendar-head">
          <h2 id="booking-title" className="tf-label">
            Lịch còn trống
          </h2>
          <span className="tf-caption">Chọn ngày nhận rồi ngày trả</span>
        </div>

        <div className="mini-calendar">
          <div className="mini-calendar__nav">
            <button
              type="button"
              className="mini-calendar__step"
              aria-label="Tháng trước"
              disabled={offset === 0}
              onClick={() => setOffset((value) => value - 1)}
            >
              <ChevronLeft aria-hidden />
            </button>
            <p className="mini-calendar__title" aria-live="polite">
              Tháng {month.month() + 1}, {month.year()}
            </p>
            <button
              type="button"
              className="mini-calendar__step"
              aria-label="Tháng sau"
              disabled={offset >= maxOffset}
              onClick={() => setOffset((value) => value + 1)}
            >
              <ChevronRight aria-hidden />
            </button>
          </div>

          {availability.isError ? (
            <div className="mini-calendar__error" role="alert">
              <p>{getApiErrorMessage(availability.error)}</p>
              <button type="button" className="tf-btn tf-btn--soft tf-btn--inline" onClick={() => void availability.refetch()}>
                Tải lại lịch
              </button>
            </div>
          ) : (
            <ol className={`mini-calendar__grid ${availability.isPending ? 'is-loading' : ''}`} aria-busy={availability.isPending}>
              {WEEKDAYS.map((weekday) => (
                <li key={weekday} className="mini-calendar__weekday" aria-hidden="true">
                  {weekday}
                </li>
              ))}
              {Array.from({ length: leadingBlanks }, (_, index) => (
                <li key={`blank-${index}`} aria-hidden="true" />
              ))}
              {Array.from({ length: month.daysInMonth() }, (_, index) => {
                const date = month.date(index + 1)
                const status = statusOf(date)
                const isStart = range.start?.isSame(date, 'day') ?? false
                const isEnd = range.end?.isSame(date, 'day') ?? false
                const inRange = Boolean(range.start && range.end && date.isAfter(range.start) && date.isBefore(range.end))
                const classes = [
                  'mini-calendar__day',
                  `is-${status}`,
                  date.isSame(today, 'day') && 'is-today',
                  (isStart || isEnd) && 'is-selected',
                  inRange && 'is-in-range',
                ]
                  .filter(Boolean)
                  .join(' ')
                return (
                  <li key={index}>
                    <button
                      type="button"
                      className={classes}
                      disabled={status !== 'free' || availability.isPending}
                      aria-pressed={isStart || isEnd || inRange}
                      aria-label={`${dayLabel.format(date.toDate())}: ${STATUS_TEXT[status]}`}
                      onClick={() => pick(date)}
                    >
                      {index + 1}
                    </button>
                  </li>
                )
              })}
            </ol>
          )}

          <ul className="mini-calendar__legend">
            <li>
              <span className="mini-calendar__swatch is-free" aria-hidden /> Còn trống
            </li>
            <li>
              <span className="mini-calendar__swatch is-booked" aria-hidden /> Đã có người thuê
            </li>
            <li>
              <span className="mini-calendar__swatch is-selected" aria-hidden /> Bạn chọn
            </li>
          </ul>
        </div>
      </div>

      <div className="booking-card__dates">
        <div className={`booking-card__date ${range.start ? 'is-set' : ''}`}>
          <span className="tf-caption">Ngày nhận</span>
          <strong>{range.start ? dayLabel.format(range.start.toDate()) : 'Chưa chọn'}</strong>
        </div>
        <div className={`booking-card__date ${range.end ? 'is-set' : ''}`}>
          <span className="tf-caption">Ngày trả</span>
          <strong>{range.end ? dayLabel.format(range.end.toDate()) : 'Chưa chọn'}</strong>
        </div>
      </div>

      <div className="booking-card__voucher" title="Sắp ra mắt">
        <label htmlFor="booking-voucher" className="sr-only">
          Mã giảm giá
        </label>
        <input id="booking-voucher" className="tf-input" placeholder="Mã giảm giá (sắp ra mắt)" disabled />
        <button type="button" className="tf-btn tf-btn--soft tf-btn--inline" disabled>
          Áp dụng
        </button>
      </div>

      {days > 0 ? (
        <dl className="booking-card__summary">
          <div>
            <dt>
              Tiền thuê ({formatVnd(toy.priceOrRate)} × {days} ngày)
            </dt>
            <dd>{formatVnd(rentTotal)}</dd>
          </div>
          {deposit > 0 && (
            <div>
              <dt>Tiền cọc (giữ trong ví ToyFlow)</dt>
              <dd>{formatVnd(deposit)}</dd>
            </div>
          )}
          <div className="booking-card__total">
            <dt>Tổng thanh toán</dt>
            <dd>{formatVnd(rentTotal + deposit)}</dd>
          </div>
        </dl>
      ) : (
        <p className="booking-card__hint">
          <CalendarDays aria-hidden />
          Chọn ngày nhận và ngày trả trên lịch để xem tổng chi phí.
        </p>
      )}

      <button type="button" className="tf-btn tf-btn--primary" disabled aria-describedby="booking-note">
        Gửi yêu cầu thuê
      </button>
      <p id="booking-note" className="booking-card__note">
        <ShieldCheck aria-hidden />
        Đặt thuê trực tuyến sắp ra mắt. Lịch trống và chi phí ở trên đã tính theo dữ liệu thật của món đồ.
      </p>
    </section>
  )
}
