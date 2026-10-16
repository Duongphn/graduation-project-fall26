import { DeleteOutlined, EditOutlined, EyeInvisibleOutlined, EyeOutlined } from '@ant-design/icons'
import { Button, Popconfirm, Space, Tooltip } from 'antd'

import { useDeleteOrganization, useHideOrganization, useShowOrganization } from '../hooks'
import type { Organization } from '../types'

interface OrganizationRowActionsProps {
  organization: Organization
  onEdit: (id: string) => void
}

// Why the delete button is disabled; mirrors the backend 409 rules.
const deleteBlockedReason = (organization: Organization): string | undefined => {
  if (organization.openRequestCount > 0) {
    return `Đang có ${organization.openRequestCount} yêu cầu quyên góp chưa hoàn tất: chỉ có thể ẩn.`
  }
  if (organization.requestCount > 0) {
    return 'Tổ chức đã có yêu cầu quyên góp trong lịch sử nên phải giữ lại: hãy ẩn thay vì xoá.'
  }
  return undefined
}

// Edit / hide / show / delete buttons of one organization row. Toasts use the backend message.
export function OrganizationRowActions({ organization, onEdit }: OrganizationRowActionsProps) {
  const hide = useHideOrganization()
  const show = useShowOrganization()
  const remove = useDeleteOrganization()
  const blockedReason = deleteBlockedReason(organization)

  return (
    <Space size={4} wrap={false}>
      <Button
        type="link"
        size="small"
        icon={<EditOutlined />}
        onClick={() => onEdit(organization.id)}
      >
        Sửa
      </Button>
      {organization.status === 'HIDDEN' ? (
        <Popconfirm
          title="Hiện lại tổ chức?"
          description="Người tặng sẽ thấy và chọn được tổ chức này."
          okText="Hiện"
          cancelText="Huỷ"
          onConfirm={() => show.mutateAsync(organization.id)}
        >
          <Button type="link" size="small" icon={<EyeOutlined />} loading={show.isPending}>
            Hiện
          </Button>
        </Popconfirm>
      ) : (
        <Popconfirm
          title="Ẩn tổ chức?"
          description={
            organization.openRequestCount > 0
              ? `${organization.openRequestCount} yêu cầu đang chạy vẫn tiếp tục; tổ chức không nhận yêu cầu mới.`
              : 'Người tặng sẽ không thấy tổ chức này nữa.'
          }
          okText="Ẩn"
          cancelText="Huỷ"
          onConfirm={() => hide.mutateAsync(organization.id)}
        >
          <Button type="link" size="small" icon={<EyeInvisibleOutlined />} loading={hide.isPending}>
            Ẩn
          </Button>
        </Popconfirm>
      )}
      {blockedReason ? (
        <Tooltip title={blockedReason}>
          <Button type="link" size="small" danger disabled icon={<DeleteOutlined />}>
            Xoá
          </Button>
        </Tooltip>
      ) : (
        <Popconfirm
          title="Xoá tổ chức?"
          description="Tổ chức chưa từng nhận yêu cầu quyên góp. Thao tác này không hoàn tác được."
          okText="Xoá"
          okButtonProps={{ danger: true }}
          cancelText="Huỷ"
          onConfirm={() => remove.mutateAsync(organization.id)}
        >
          <Button
            type="link"
            size="small"
            danger
            icon={<DeleteOutlined />}
            loading={remove.isPending}
          >
            Xoá
          </Button>
        </Popconfirm>
      )}
    </Space>
  )
}
