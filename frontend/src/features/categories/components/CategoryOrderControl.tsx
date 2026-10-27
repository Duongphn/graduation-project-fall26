import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons'
import { Button, Tooltip } from 'antd'

interface CategoryOrderControlProps {
  displayOrder: number
  isFirst: boolean
  isLast: boolean
  // Why moving is not possible right now (e.g. a filter hides part of the list).
  disabledReason?: string
  busy?: boolean
  onMove: (offset: -1 | 1) => void
}

const moves = [
  { offset: -1, label: 'Đưa lên trên', icon: <ArrowUpOutlined /> },
  { offset: 1, label: 'Đưa xuống dưới', icon: <ArrowDownOutlined /> },
] as const

// Display order with up/down buttons that swap the row with its neighbour. The buttons sit in a
// span so the tooltip still explains why they are disabled.
export function CategoryOrderControl({
  displayOrder,
  isFirst,
  isLast,
  disabledReason,
  busy,
  onMove,
}: CategoryOrderControlProps) {
  const blocked = Boolean(disabledReason) || busy
  return (
    <div className="flex items-center gap-1">
      <span className="w-8 text-right tabular-nums text-muted">{displayOrder}</span>
      {moves.map(({ offset, label, icon }) => (
        <Tooltip key={offset} title={disabledReason ?? label}>
          <span>
            <Button
              size="small"
              type="text"
              aria-label={label}
              icon={icon}
              disabled={blocked || (offset === -1 ? isFirst : isLast)}
              onClick={() => onMove(offset)}
            />
          </span>
        </Tooltip>
      ))}
    </div>
  )
}
