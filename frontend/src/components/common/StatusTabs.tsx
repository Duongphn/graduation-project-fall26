import { Badge, Tabs } from 'antd'

import { palette } from '../../styles/palette'
import { statusOptions } from '../../styles/status'
import type { StatusDomain, StatusOf } from '../../styles/status'

const ALL = '__all__'

interface StatusTabsProps<D extends StatusDomain> {
  domain: D
  // Selected status; undefined = "Tất cả".
  value: StatusOf<D> | undefined
  onChange: (status: StatusOf<D> | undefined) => void
  // Statuses to show, in order (default: every status of the domain).
  statuses?: readonly StatusOf<D>[]
  // Number per status, e.g. from a /counts endpoint.
  counts?: Partial<Record<StatusOf<D>, number>>
  // Show a first "Tất cả" tab.
  showAll?: boolean
}

// Status filter tabs above a list; labels come from src/styles/status.ts.
export function StatusTabs<D extends StatusDomain>({
  domain,
  value,
  onChange,
  statuses,
  counts,
  showAll = true,
}: StatusTabsProps<D>) {
  const items = statusOptions(domain, statuses).map((option) => ({
    key: option.value,
    label: (
      <span className="flex items-center gap-2">
        {option.label}
        {counts?.[option.value] !== undefined && (
          <Badge count={counts[option.value]} showZero overflowCount={999} color={palette.textMuted} />
        )}
      </span>
    ),
  }))

  return (
    <Tabs
      activeKey={value ?? (showAll ? ALL : items[0]?.key)}
      onChange={(key) => onChange(key === ALL ? undefined : (key as StatusOf<D>))}
      items={showAll ? [{ key: ALL, label: 'Tất cả' }, ...items] : items}
    />
  )
}
