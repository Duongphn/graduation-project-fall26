import { Tag } from 'antd'

import { useTheme } from '../../contexts/theme-context'
import { palettes } from '../../styles/palette'
import { darkToneColors, getStatusStyle, toneColors } from '../../styles/status'
import type { StatusDomain, StatusOf } from '../../styles/status'

interface StatusTagProps<D extends StatusDomain> {
  domain: D
  status: StatusOf<D>
}

// Coloured, translated status label, e.g. <StatusTag domain="toy" status="ACTIVE" />.
// Colours and labels live in src/styles/status.ts. Dark mode: tone-coloured text and border on the
// dark elevated surface (antd's filled tag would tint a light pastel background in both modes).
export function StatusTag<D extends StatusDomain>({ domain, status }: StatusTagProps<D>) {
  const { isDark } = useTheme()
  const style = getStatusStyle(domain, status)
  if (isDark) {
    const color = darkToneColors[style.tone]
    return (
      <Tag
        variant="outlined"
        className="m-0"
        style={{ color, borderColor: color, background: palettes.dark.elevated }}
      >
        {style.label}
      </Tag>
    )
  }
  return (
    <Tag color={toneColors[style.tone]} className="m-0">
      {style.label}
    </Tag>
  )
}
