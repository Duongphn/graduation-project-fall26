import { Descriptions, Tag, Typography } from 'antd'
import type { DescriptionsProps } from 'antd'

import { formatDate } from '../../../utils/format'
import { ageGroupLabel, handoverMethodLabelsOf } from '../constants'
import type { Organization } from '../types'

interface OrganizationDetailsProps {
  organization: Organization
  // Category id -> name (Admin options, hidden ones included).
  categoryNames: Map<string, string>
}

const missing = <Typography.Text type="secondary">Chưa nhập</Typography.Text>

const pointItems = (organization: Organization): DescriptionsProps['items'] => {
  const point = organization.receivingPoint
  if (!point) {
    return [
      {
        key: 'none',
        label: 'Điểm nhận',
        children: (
          <Typography.Text type="warning">
            Chưa có điểm nhận: hãy sửa tổ chức để nhập điểm nhận và nhu cầu.
          </Typography.Text>
        ),
      },
    ]
  }
  return [
    { key: 'address', label: 'Địa chỉ', children: [point.street, point.ward, point.province].join(', ') },
    { key: 'hours', label: 'Giờ nhận', children: point.openingHours },
    { key: 'contact', label: 'Người liên hệ', children: `${point.contactName} · ${point.contactPhone}` },
    { key: 'methods', label: 'Cách bàn giao', children: handoverMethodLabelsOf(point).join(', ') },
  ]
}

const needsItems = (
  organization: Organization,
  categoryNames: Map<string, string>,
): DescriptionsProps['items'] => [
  {
    key: 'ages',
    label: 'Nhóm tuổi',
    children:
      organization.ageGroups.length > 0
        ? organization.ageGroups.map((group) => <Tag key={group.minAge}>{ageGroupLabel(group)}</Tag>)
        : missing,
  },
  {
    key: 'categories',
    label: 'Danh mục',
    children:
      organization.categoryIds.length > 0
        ? organization.categoryIds.map((id) => <Tag key={id}>{categoryNames.get(id) ?? id}</Tag>)
        : missing,
  },
  {
    key: 'area',
    label: 'Khu vực hỗ trợ',
    children: (
      <>
        {organization.areaProvince ?? missing}
        {organization.isRemoteArea && (
          <Tag color="purple" className="ml-2">
            Vùng khó khăn
          </Tag>
        )}
      </>
    ),
  },
  {
    key: 'accepting',
    label: 'Nhận đồ chơi',
    children: organization.isAccepting ? (
      <Tag color="green">Đang nhận</Tag>
    ) : (
      <Tag>Tạm ngừng: không nhận yêu cầu mới</Tag>
    ),
  },
  ...(organization.supportCriteria
    ? [{ key: 'note', label: 'Ghi chú', children: organization.supportCriteria }]
    : []),
]

// UC34, R03 III.7.5.1 (2): what the Admin checked and when.
const verificationItems = (organization: Organization): DescriptionsProps['items'] => [
  {
    key: 'verified',
    label: 'Đã xác minh',
    children: organization.verifiedAt ? formatDate(organization.verifiedAt) : missing,
  },
  { key: 'note', label: 'Ghi chú xác minh', children: organization.verificationNote ?? missing },
]

// R03 III.7.5.1 (2), (4) and (7): the check, the receiving point and the needs of one organization.
export function OrganizationDetails({ organization, categoryNames }: OrganizationDetailsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Descriptions
        size="small"
        column={1}
        bordered
        title="Xác minh"
        className="lg:col-span-2"
        items={verificationItems(organization)}
      />
      <Descriptions size="small" column={1} bordered title="Điểm nhận đồ chơi" items={pointItems(organization)} />
      <Descriptions
        size="small"
        column={1}
        bordered
        title="Nhu cầu"
        items={needsItems(organization, categoryNames)}
      />
    </div>
  )
}
