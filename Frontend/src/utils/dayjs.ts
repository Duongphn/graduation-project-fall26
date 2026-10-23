import dayjs from 'dayjs'
import 'dayjs/locale/vi'
import relativeTime from 'dayjs/plugin/relativeTime'

// The only place dayjs is configured (Vietnamese locale + plugins). Import dayjs from here.
dayjs.extend(relativeTime)
dayjs.locale('vi')

export { dayjs }
