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

/** A moment as seen in Vietnam (for display only). */
export const inVietnam = (value: string | Date) => dayjs(value).tz(VN_TIME_ZONE)

export { dayjs }
