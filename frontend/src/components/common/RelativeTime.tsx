import { Tooltip, Typography } from 'antd'

import { formatDateTime, formatFromNow } from '../../utils/format'

interface RelativeTimeProps {
  value: string | Date | null | undefined
  // Also print the exact time under the relative one (otherwise only in the tooltip).
  showAbsolute?: boolean
}

// "3 giờ trước" with the exact time below and in a tooltip, e.g. for waiting queues.
export function RelativeTime({ value, showAbsolute = true }: RelativeTimeProps) {
  if (!value) return <span>—</span>
  const absolute = formatDateTime(value)
  return (
    <div className="flex flex-col leading-tight">
      <Tooltip title={absolute}>
        <span>{formatFromNow(value)}</span>
      </Tooltip>
      {showAbsolute && (
        <Typography.Text type="secondary" className="text-xs">
          {absolute}
        </Typography.Text>
      )}
    </div>
  )
}
