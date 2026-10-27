import { Tag } from 'antd'

import type { ListingType } from '../../constants/domain'
import { listingTypeLabels } from '../../constants/labels'
import { listingTypeColors } from '../../styles/status'

// Coloured listing type (Cho thuê / Bán lại / Tặng); colours live in src/styles/status.ts.
export function ListingTypeTag({ type }: { type: ListingType }) {
  return (
    <Tag color={listingTypeColors[type]} className="m-0">
      {listingTypeLabels[type]}
    </Tag>
  )
}
