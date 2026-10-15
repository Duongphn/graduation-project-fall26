import { DeleteOutlined, EditOutlined, EyeInvisibleOutlined, EyeOutlined } from '@ant-design/icons'
import { Button, Popconfirm, Tooltip } from 'antd'

import { useDeleteCategory, useHideCategory, useShowCategory } from '../hooks'
import type { AdminCategory } from '../types'

interface CategoryRowActionsProps {
  category: AdminCategory
  onEdit: (category: AdminCategory) => void
}

const IN_USE_HINT = 'Danh mục đang có đồ chơi, chỉ có thể ẩn'

// Sửa / Ẩn or Hiện / Xoá for one row. A category that toys use cannot be deleted, only hidden.
// Success and error toasts come from the backend message (useApiMutation).
export function CategoryRowActions({ category, onEdit }: CategoryRowActionsProps) {
  const hideMutation = useHideCategory()
  const showMutation = useShowCategory()
  const deleteMutation = useDeleteCategory()
  const hidden = category.status === 'HIDDEN'
  const visibility = hidden
    ? {
        title: 'Hiện lại danh mục?',
        description: 'Danh mục sẽ xuất hiện lại khi đăng tin và tìm kiếm.',
        okText: 'Hiện lại',
        label: 'Hiện',
        icon: <EyeOutlined />,
        mutation: showMutation,
      }
    : {
        title: 'Ẩn danh mục?',
        description:
          'Danh mục sẽ không còn hiện khi đăng tin và tìm kiếm. Đồ chơi đã đăng vẫn giữ nguyên.',
        okText: 'Ẩn',
        label: 'Ẩn',
        icon: <EyeInvisibleOutlined />,
        mutation: hideMutation,
      }

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button size="small" icon={<EditOutlined />} onClick={() => onEdit(category)}>
        Sửa
      </Button>

      <Popconfirm
        title={visibility.title}
        description={visibility.description}
        okText={visibility.okText}
        cancelText="Huỷ"
        onConfirm={() => visibility.mutation.mutateAsync(category.id).catch(() => undefined)}
      >
        <Button size="small" icon={visibility.icon} loading={visibility.mutation.isPending}>
          {visibility.label}
        </Button>
      </Popconfirm>

      {category.canDelete ? (
        <Popconfirm
          title="Xoá danh mục?"
          description={`"${category.name}" sẽ bị xoá vĩnh viễn.`}
          okText="Xoá"
          cancelText="Huỷ"
          okButtonProps={{ danger: true }}
          onConfirm={() => deleteMutation.mutateAsync(category.id).catch(() => undefined)}
        >
          <Button size="small" danger icon={<DeleteOutlined />} loading={deleteMutation.isPending}>
            Xoá
          </Button>
        </Popconfirm>
      ) : (
        <Tooltip title={IN_USE_HINT}>
          {/* A disabled button gets no mouse events; the span keeps the tooltip working and is
              focusable with the reason as its name, for keyboard and screen reader users. */}
          <span tabIndex={0} role="note" aria-label={`Xoá: ${IN_USE_HINT}`}>
            <Button size="small" danger icon={<DeleteOutlined />} disabled>
              Xoá
            </Button>
          </span>
        </Tooltip>
      )}
    </div>
  )
}
