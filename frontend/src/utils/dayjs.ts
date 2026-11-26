import dayjs from 'dayjs'
import 'dayjs/locale/vi'
import relativeTime from 'dayjs/plugin/relativeTime'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'

// The only place dayjs is configured (Vietnamese locale + plugins). Import dayjs from here.
dayjs.extend(relativeTime)
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.locale('vi')

/** Every date and time is shown in Vietnam time, whatever the device setting (R03 IV.1.1, UTC+7). */
export const VN_TIME_ZONE = 'Asia/Ho_Chi_Minh'

// A plain calendar day ("2026-11-23", e.g. a rental period) is already a day in Vietnam.
const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/

/** A moment as seen in Vietnam (for display only); a plain "YYYY-MM-DD" stays that day. */
export const inVietnam = (value: string | Date) =>
  typeof value === 'string' && CALENDAR_DAY.test(value)
    ? dayjs.tz(value, VN_TIME_ZONE)
    : dayjs(value).tz(VN_TIME_ZONE)

export { dayjs }
