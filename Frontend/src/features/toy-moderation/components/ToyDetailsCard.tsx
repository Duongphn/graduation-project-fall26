import { Card, Descriptions, Typography } from 'antd'
import type { DescriptionsProps } from 'antd'

import { ListingTypeTag, StatusTag } from '../../../components/common'
import { toyConditionLabels } from '../../../constants/labels'
import { formatAgeGroup, formatDateTime, formatMoney } from '../../../utils/format'
import type { ToyModerationDetail } from '../types'

const priceItems = (toy: ToyModerationDetail): NonNullable<DescriptionsProps['items']> => {
  if (toy.listingType === 'RENT') {
    return [
      { key: 'rent', label: 'Giá thuê / ngày', children: formatMoney(toy.pricing.rentPerDay) },
      { key: 'deposit', label: 'Tiền cọc', children: formatMoney(toy.pricing.deposit) },
    ]
  }
  if (toy.listingType === 'SALE') {
    return [{ key: 'sale', label: 'Giá bán', children: formatMoney(toy.pricing.salePrice) }]
  }
  return [{ key: 'donate', label: 'Giá', children: 'Tặng miễn phí (không phí, không cọc)' }]
}

// What the Owner wrote: type, condition, category, age group, price, area and description.
export function ToyDetailsCard({ toy }: { toy: ToyModerationDetail }) {
  const items: DescriptionsProps['items'] = [
    { key: 'type', label: 'Loại tin', children: <ListingTypeTag type={toy.listingType} /> },
    { key: 'condition', label: 'Tình trạng', children: toyConditionLabels[toy.condition] },
    {
      key: 'category',
      label: 'Danh mục',
      children: toy.category ? (
        <span className="inline-flex flex-wrap items-center gap-2">
          {toy.category.name}
          {toy.category.status === 'HIDDEN' && <StatusTag domain="visibility" status="HIDDEN" />}
        </span>
      ) : (
        '—'
      ),
    },
    { key: 'age', label: 'Độ tuổi phù hợp', children: formatAgeGroup(toy.ageGroup) },
    ...priceItems(toy),
    { key: 'area', label: 'Khu vực', children: toy.area || '—' },
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
