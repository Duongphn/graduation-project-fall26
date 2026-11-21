import { Tag } from 'antd'

import { formatTrustScore } from '../format'

/**
 * Điểm tin cậy trong bảng Admin. Màu theo vùng điểm (đỏ dưới 30, cam dưới 60) chỉ để đọc nhanh;
 * ngưỡng chặn thật do system settings quyết định ở server.
 */
export function TrustScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <Tag>{formatTrustScore(score)}</Tag>
  const color = score < 30 ? 'red' : score < 60 ? 'orange' : 'green'
  return (
    <Tag color={color} className="!m-0 tabular-nums !font-semibold">
      {formatTrustScore(score)} / 100
    </Tag>
  )
}
