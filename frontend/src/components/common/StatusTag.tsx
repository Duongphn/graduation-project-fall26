import { Tag } from 'antd'

import { getStatusStyle, toneColors } from '../../styles/status'
import type { StatusDomain, StatusOf } from '../../styles/status'

interface StatusTagProps<D extends StatusDomain> {
  domain: D
  status: StatusOf<D>
}

// Coloured, translated status label, e.g. <StatusTag domain="toy" status="ACTIVE" />.
// Colours and labels live in src/styles/status.ts.
export function StatusTag<D extends StatusDomain>({ domain, status }: StatusTagProps<D>) {
  const style = getStatusStyle(domain, status)
  return (
    <Tag color={toneColors[style.tone]} className="m-0">
      {style.label}
    </Tag>
  )
}
