import { useQuery } from '@tanstack/react-query'
import dayjs, { type Dayjs } from 'dayjs'
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, CircleAlert, LogIn, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useIsSignedIn } from '../../../hooks/use-is-signed-in'
import { PATHS } from '../../../routes/paths'
import { ApiError, getErrorMessage } from '../../../services/api-error'
import { getApiErrorMessage } from '../../../services/http-client'
import { profileQuery } from '../../profile/profile-queries'
import { formatVnd } from '../../toy-listings/format-vnd'
import type { ToyDetail } from '../toy-catalog-api'
import { toyAvailabilityQuery } from '../toy-catalog-queries'
import {
  rentalQuoteQuery,
  useCreateRental,
  type CreatedRentalOrder,
  type DateRange,
  type DatesUnavailableDetails,
} from '../rental-request-api'

const DATE_KEY = 'YYYY-MM-DD'
/** Backend chỉ trả lịch trong tối đa 180 ngày tính từ hôm nay */
const WINDOW_DAYS = 180
const WEEKDAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
const dayLabel = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' })
/** Ô ngày trên vé: "12/11" to, thứ nhỏ bên dưới */
const shortDate = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' })
const weekdayName = new Intl.DateTimeFormat('vi-VN', { weekday: 'long' })
const deadlineLabel = new Intl.DateTimeFormat('vi-VN', {
  hour: '2-digit',
  minute: '2-digit',
  day: '2-digit',
  month: '2-digit',
})

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

/** Lỗi khi gửi yêu cầu; trùng lịch thì kèm khoảng trống backend gợi ý */
interface Failure {
  message: string
  code?: string
  suggestion?: DateRange | null
}

const toFailure = (error: unknown): Failure => {
  if (!(error instanceof ApiError)) return { message: getErrorMessage(error) }
  const details = error.details as DatesUnavailableDetails | undefined
  return {
    message: error.message,
    code: error.code,
    suggestion: error.code === 'RENTAL_DATES_UNAVAILABLE' ? (details?.suggestion ?? null) : undefined,
  }
}

const formatRange = ({ startDate, endDate }: DateRange) =>
  `${shortDate.format(dayjs(startDate).toDate())} → ${shortDate.format(dayjs(endDate).toDate())}`

/**
 * Thẻ đặt thuê dạng "vé thuê" (UC06): chọn ngày nhận → ngày trả trên lịch, server báo giá
 * (POST /rentals/quote) rồi gửi yêu cầu (POST /rentals) tạo đơn PENDING giữ lịch chờ chủ đồ duyệt.
 * Lịch tải một lần cả cửa sổ 180 ngày để kiểm tra khoảng chọn không vắt qua ngày đã có người thuê,
 * kể cả khi khoảng đó kéo sang tháng khác. Chủ tin chỉ xem lịch, không tự thuê được.
 */
export function RentalBookingCard({ toy }: { toy: ToyDetail }) {
  const isSignedIn = useIsSignedIn()
  const profile = useQuery({ ...profileQuery, enabled: isSignedIn })
  const isOwner = isSignedIn && profile.data?.id === toy.owner.id
  const location = useLocation()
  const loginPath = `${PATHS.login}?redirect=${encodeURIComponent(location.pathname + location.search)}`

  const [today] = useState(() => dayjs().startOf('day'))
  const lastOpenDay = today.add(WINDOW_DAYS - 1, 'day')
  const maxOffset = lastOpenDay.startOf('month').diff(today.startOf('month'), 'month')
  const [offset, setOffset] = useState(0)
  const [range, setRange] = useState<Range>({ start: null, end: null })
  const [failure, setFailure] = useState<Failure | null>(null)
  const [created, setCreated] = useState<CreatedRentalOrder | null>(null)

  const availability = useQuery(toyAvailabilityQuery(toy.id, today.format(DATE_KEY), lastOpenDay.format(DATE_KEY)))

  const period =
    range.start && range.end
      ? { toyId: toy.id, startDate: range.start.format(DATE_KEY), endDate: range.end.format(DATE_KEY) }
      : null
  const quote = useQuery({
    ...rentalQuoteQuery(period ?? { toyId: toy.id, startDate: '', endDate: '' }),
    enabled: Boolean(period) && isSignedIn && !isOwner && !created,
  })

  const create = useCreateRental(toy.id, {
    onCreated: (order) => {
      setCreated(order)
      setRange({ start: null, end: null })
    },
    onFailed: (error) => {
      setFailure(toFailure(error))
      return true
    },
  })

  const booked = new Set<string>()
  for (const item of availability.data ?? []) {
    for (let day = dayjs(item.startDate); !day.isAfter(dayjs(item.endDate)); day = day.add(1, 'day')) {
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
    setFailure(null)
    setCreated(null)
    setRange(({ start, end }) => {
      if (!start || end || date.isBefore(start) || !rangeIsFree(start, date)) return { start: date, end: null }
      return { start, end: date }
    })
  }

  /** Nhận khoảng trống backend gợi ý: chọn sẵn và lật lịch tới tháng của ngày nhận */
  const applySuggestion = (suggestion: DateRange) => {
    const start = dayjs(suggestion.startDate)
    setFailure(null)
    setRange({ start, end: dayjs(suggestion.endDate) })
    setOffset(Math.min(maxOffset, Math.max(0, start.startOf('month').diff(today.startOf('month'), 'month'))))
  }

  const submit = () => {
    if (!period) return
    setFailure(null)
    create.mutate(period)
  }

  const month = today.startOf('month').add(offset, 'month')
  const leadingBlanks = (month.day() + 6) % 7 // tuần bắt đầu từ thứ Hai
  const days = range.start && range.end ? range.end.diff(range.start, 'day') + 1 : 0
  const deposit = toy.depositPrice ?? 0
  // Giá server báo (đã chốt theo cấu hình phí) ưu tiên hơn số tạm tính ở trình duyệt
  const pricing = quote.data?.pricing
  const dailyRate = pricing?.dailyRate ?? toy.priceOrRate
  const rentTotal = pricing?.rentalFee ?? days * toy.priceOrRate
  const depositTotal = pricing?.depositAmount ?? deposit
  const total = pricing?.totalPayable ?? rentTotal + depositTotal
  const quoteError = quote.isError ? toFailure(quote.error) : null
  const unavailable = quote.data?.available === false
  const canSubmit = Boolean(period) && quote.isSuccess && !unavailable && !create.isPending

  return (
    <section className="rent-ticket" aria-labelledby="booking-title">
      {/* Đầu vé: giá theo ngày là con số chính, tiền cọc đi kèm ngay bên dưới */}
      <header className="rent-ticket__head">
        <p className="rent-ticket__eyebrow">Giá thuê</p>
        <p className="rent-ticket__price">
          <strong>{formatVnd(toy.priceOrRate)}</strong>
          <span>/ ngày</span>
        </p>
        {deposit > 0 && (
          <p className="rent-ticket__deposit">
            <span>Tiền cọc (hoàn lại khi trả đồ)</span>
            <strong>{formatVnd(deposit)}</strong>
          </p>
        )}
      </header>

      <div className="rent-ticket__body">
        <div className="rent-ticket__section-head">
          <h2 id="booking-title" className="rent-ticket__title">
            Lịch còn trống
          </h2>
          <span className="rent-ticket__caption">
            {isOwner ? 'Lịch đặt thuê món đồ của bạn' : 'Chọn ngày nhận rồi ngày trả'}
          </span>
        </div>

        <div className="rent-cal">
          <div className="rent-cal__nav">
            <button
              type="button"
              className="rent-cal__step"
              aria-label="Tháng trước"
              disabled={offset === 0}
              onClick={() => setOffset((value) => value - 1)}
            >
              <ChevronLeft aria-hidden />
            </button>
            <p className="rent-cal__month" aria-live="polite">
              Tháng {month.month() + 1}
              <span>{month.year()}</span>
            </p>
            <button
              type="button"
              className="rent-cal__step"
              aria-label="Tháng sau"
              disabled={offset >= maxOffset}
              onClick={() => setOffset((value) => value + 1)}
            >
              <ChevronRight aria-hidden />
            </button>
          </div>

          {availability.isError ? (
            <div className="rent-cal__error" role="alert">
              <p>{getApiErrorMessage(availability.error)}</p>
              <button type="button" className="rent-ticket__ghost-btn" onClick={() => void availability.refetch()}>
                Tải lại lịch
              </button>
            </div>
          ) : (
            <ol className={`rent-cal__grid ${availability.isPending ? 'is-loading' : ''}`} aria-busy={availability.isPending}>
              {WEEKDAYS.map((weekday) => (
                <li key={weekday} className="rent-cal__weekday" aria-hidden="true">
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
                const hasSpan = Boolean(range.start && range.end && !range.start.isSame(range.end, 'day'))
                // Dải nền nối ngày nhận → ngày trả thành một khối liền, kể cả qua cuối tuần
                const cellClasses = [
                  'rent-cal__cell',
                  inRange && 'is-in-range',
                  hasSpan && isStart && 'is-span-start',
                  hasSpan && isEnd && 'is-span-end',
                ]
                  .filter(Boolean)
                  .join(' ')
                const classes = [
                  'rent-cal__day',
                  `is-${status}`,
                  date.isSame(today, 'day') && 'is-today',
                  (isStart || isEnd) && 'is-selected',
                  inRange && 'is-in-range',
                ]
                  .filter(Boolean)
                  .join(' ')
                return (
                  <li key={index} className={cellClasses}>
                    <button
                      type="button"
                      className={classes}
                      disabled={status !== 'free' || availability.isPending || isOwner || create.isPending}
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

          <ul className="rent-cal__legend">
            <li>
              <span className="rent-cal__swatch is-free" aria-hidden /> Còn trống
            </li>
            <li>
              <span className="rent-cal__swatch is-booked" aria-hidden /> Đã có người thuê
            </li>
            {!isOwner && (
              <li>
                <span className="rent-cal__swatch is-selected" aria-hidden /> Bạn chọn
              </li>
            )}
          </ul>
        </div>

        {!isOwner && (
          <>
            {/* Cuống vé: ngày nhận ── số ngày ── ngày trả */}
            <div className="rent-ticket__dates">
              <div className={`rent-ticket__date ${range.start ? 'is-set' : ''}`}>
                <span className="rent-ticket__caption">Ngày nhận</span>
                {range.start ? (
                  <>
                    <strong>{shortDate.format(range.start.toDate())}</strong>
                    <small>{weekdayName.format(range.start.toDate())}</small>
                  </>
                ) : (
                  <strong className="is-empty">Chưa chọn</strong>
                )}
              </div>
              <span className={`rent-ticket__span ${days > 0 ? 'is-set' : ''}`} aria-hidden="true">
                {days > 0 ? `${days} ngày` : ''}
              </span>
              <div className={`rent-ticket__date rent-ticket__date--end ${range.end ? 'is-set' : ''}`}>
                <span className="rent-ticket__caption">Ngày trả</span>
                {range.end ? (
                  <>
                    <strong>{shortDate.format(range.end.toDate())}</strong>
                    <small>{weekdayName.format(range.end.toDate())}</small>
                  </>
                ) : (
                  <strong className="is-empty">Chưa chọn</strong>
                )}
              </div>
            </div>

            <div className="rent-ticket__voucher" title="Sắp ra mắt">
              <label htmlFor="booking-voucher" className="sr-only">
                Mã giảm giá
              </label>
              <input
                id="booking-voucher"
                className="rent-ticket__voucher-input"
                placeholder="Mã giảm giá (sắp ra mắt)"
                disabled
              />
              <button type="button" className="rent-ticket__ghost-btn" disabled>
                Áp dụng
              </button>
            </div>
          </>
        )}
      </div>

      {/* Đường xé vé tách phần chọn ngày với phần tiền */}
      <div className="rent-ticket__perforation" aria-hidden="true" />

      <div className="rent-ticket__foot">
        {isOwner ? (
          <p className="rent-ticket__hint">
            <ShieldCheck aria-hidden />
            Đây là tin của bạn nên không thể tự đặt thuê. Yêu cầu thuê từ người khác sẽ được báo cho bạn để duyệt.
          </p>
        ) : created ? (
          <div className="rent-ticket__success" role="status">
            <p className="rent-ticket__success-title">
              <CheckCircle2 aria-hidden />
              Đã gửi yêu cầu thuê
            </p>
            <dl className="rent-ticket__summary">
              <div>
                <dt>Mã đơn</dt>
                <dd>{created.code}</dd>
              </div>
              <div>
                <dt>Thời gian thuê</dt>
                <dd>{formatRange(created.period)}</dd>
              </div>
              <div>
                <dt>Trạng thái</dt>
                <dd>Chờ chủ đồ duyệt</dd>
              </div>
              <div className="rent-ticket__total">
                <dt>Thanh toán sau khi được duyệt</dt>
                <dd>{formatVnd(created.pricing.totalPayable)}</dd>
              </div>
            </dl>
            <p className="rent-ticket__note">
              <ShieldCheck aria-hidden />
              {created.timer
                ? `Lịch đã được giữ cho bạn. Chủ đồ phản hồi trước ${deadlineLabel.format(new Date(created.timer.dueAt))}, quá hạn yêu cầu sẽ tự huỷ.`
                : 'Lịch đã được giữ cho bạn trong lúc chờ chủ đồ phản hồi.'}
            </p>
            <button type="button" className="rent-ticket__ghost-btn" onClick={() => setCreated(null)}>
              Đặt thêm khoảng ngày khác
            </button>
          </div>
        ) : (
          <>
            {days > 0 ? (
              <dl className={`rent-ticket__summary ${quote.isFetching ? 'is-loading' : ''}`} aria-busy={quote.isFetching}>
                <div>
                  <dt>
                    Tiền thuê ({formatVnd(dailyRate)} × {days} ngày)
                  </dt>
                  <dd>{formatVnd(rentTotal)}</dd>
                </div>
                {depositTotal > 0 && (
                  <div>
                    <dt>Tiền cọc (giữ trong ví ToyFlow)</dt>
                    <dd>{formatVnd(depositTotal)}</dd>
                  </div>
                )}
                {pricing && pricing.platformFee > 0 && (
                  <div className="rent-ticket__fee">
                    <dt>
                      Phí nền tảng {Math.round(pricing.platformFeeRate * 1000) / 10}%
                      <small>Trừ vào tiền thuê chủ đồ nhận, bạn không trả thêm</small>
                    </dt>
                    <dd>{formatVnd(pricing.platformFee)}</dd>
                  </div>
                )}
                <div className="rent-ticket__total">
                  <dt>Tổng thanh toán</dt>
                  <dd>{formatVnd(total)}</dd>
                </div>
              </dl>
            ) : (
              <p className="rent-ticket__hint">
                <CalendarDays aria-hidden />
                Chọn ngày nhận và ngày trả trên lịch để xem tổng chi phí.
              </p>
            )}

            {quoteError && (
              <div className="rent-ticket__alert" role="alert">
                <CircleAlert aria-hidden />
                <div>
                  <p>{quoteError.message}</p>
                  {quoteError.code === 'USER_NOT_VERIFIED' && (
                    <Link to={PATHS.identityVerification} className="rent-ticket__alert-link">
                      Xác thực danh tính
                    </Link>
                  )}
                </div>
              </div>
            )}

            {unavailable && (
              <div className="rent-ticket__alert" role="alert">
                <CircleAlert aria-hidden />
                <p>Khoảng ngày này vừa có người đặt. Vui lòng chọn ngày khác trên lịch.</p>
              </div>
            )}

            {failure && (
              <div className="rent-ticket__alert" role="alert">
                <CircleAlert aria-hidden />
                <div>
                  <p>{failure.message}</p>
                  {failure.suggestion && (
                    <button
                      type="button"
                      className="rent-ticket__alert-link"
                      onClick={() => applySuggestion(failure.suggestion!)}
                    >
                      Chọn khoảng trống gần nhất: {formatRange(failure.suggestion)}
                    </button>
                  )}
                </div>
              </div>
            )}

            {isSignedIn ? (
              <button type="button" className="rent-ticket__submit" disabled={!canSubmit} onClick={submit}>
                {create.isPending ? 'Đang gửi yêu cầu…' : quote.isFetching ? 'Đang kiểm tra lịch…' : 'Gửi yêu cầu thuê'}
              </button>
            ) : (
              <Link to={loginPath} className="rent-ticket__submit">
                <LogIn aria-hidden />
                Đăng nhập để đặt thuê
              </Link>
            )}
            <p className="rent-ticket__note">
              <ShieldCheck aria-hidden />
              Gửi yêu cầu chưa bị trừ tiền. Lịch được giữ cho bạn trong lúc chủ đồ duyệt; bạn chỉ thanh toán sau khi được
              chấp nhận.
            </p>
          </>
        )}
      </div>
    </section>
  )
}
