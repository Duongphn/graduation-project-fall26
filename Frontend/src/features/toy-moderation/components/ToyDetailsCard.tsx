import { Card, Descriptions, Typography } from 'antd'
import type { DescriptionsProps } from 'antd'

import { ListingTypeTag, StatusTag } from '../../../components/common'
import { formatAgeRange, formatDateTime, formatMoney } from '../../../utils/format'
import type { ToyModerationDetail } from '../types'

const priceItems = (toy: ToyModerationDetail): NonNullable<DescriptionsProps['items']> => {
  if (toy.listingType === 'rent') {
    return [
      { key: 'rent', label: 'Giá thuê / ngày', children: formatMoney(toy.priceOrRate) },
      { key: 'deposit', label: 'Tiền cọc', children: formatMoney(toy.depositPrice) },
    ]
  }
  if (toy.listingType === 'sell') {
    return [{ key: 'sale', label: 'Giá bán', children: formatMoney(toy.priceOrRate) }]
  }
  return [{ key: 'donate', label: 'Giá', children: 'Tặng miễn phí (không phí, không cọc)' }]
}

// What the Owner wrote: type, condition, category, age range, price and description.
export function ToyDetailsCard({ toy }: { toy: ToyModerationDetail }) {
  const items: DescriptionsProps['items'] = [
    { key: 'type', label: 'Loại tin', children: <ListingTypeTag type={toy.listingType} /> },
    { key: 'condition', label: 'Tình trạng', children: toy.condition },
    {
      key: 'category',
      label: 'Danh mục',
      children: toy.category ? (
        <span className="inline-flex flex-wrap items-center gap-2">
          {toy.category.name}
          {toy.category.status === 'hidden' && <StatusTag domain="visibility" status="hidden" />}
        </span>
      ) : (
        '—'
      ),
    },
    { key: 'age', label: 'Độ tuổi phù hợp', children: formatAgeRange(toy.ageRange) },
    ...priceItems(toy),
    { key: 'created', label: 'Ngày đăng', children: formatDateTime(toy.createdAt) },
    { key: 'updated', label: 'Cập nhật lần cuối', children: formatDateTime(toy.updatedAt) },
    {
      key: 'description',
      label: 'Mô tả',
      span: 'filled',
      children: (
        <Typography.Paragraph className="!mb-0 whitespace-pre-line">
          {toy.description}
        </Typography.Paragraph>
      ),
    },
  ]

  return (
    <Card title="Thông tin tin đăng">
      <Descriptions bordered size="small" column={{ xs: 1, md: 2 }} items={items} />
    </Card>
  )
}
