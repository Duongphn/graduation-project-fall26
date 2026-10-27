import { zodResolver } from '@hookform/resolvers/zod'
import { Input, InputNumber } from 'antd'
import { useForm } from 'react-hook-form'

import { FormField, FormModal } from '../../../components/common'
import { useServerFieldErrors } from '../../../hooks/useServerFieldErrors'
import { useCreateCategory, useUpdateCategory } from '../hooks'
import {
  CATEGORY_DESCRIPTION_MAX,
  CATEGORY_DISPLAY_ORDER_MAX,
  CATEGORY_NAME_MAX,
  categoryFormSchema,
} from '../schemas'
import type { CategoryFormValues } from '../schemas'
import type { AdminCategory } from '../types'

interface CategoryFormModalProps {
  open: boolean
  // Edit this category; create a new one when undefined.
  category?: AdminCategory
  onClose: () => void
}

const toFormValues = (category?: AdminCategory): CategoryFormValues => ({
  name: category?.name ?? '',
  description: category?.description ?? '',
  displayOrder: category?.displayOrder ?? null,
})

// Create or edit a category. A duplicate name (409 CATEGORY_NAME_TAKEN) is shown on the field.
// FormModal unmounts its content on close, so the form opens fresh: the page remounts this
// component with a new key for each opening.
export function CategoryFormModal({ open, category, onClose }: CategoryFormModalProps) {
  const { control, handleSubmit, setError } = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: toFormValues(category),
  })
  const onServerError = useServerFieldErrors(setError)
  const createMutation = useCreateCategory(onServerError)
  const updateMutation = useUpdateCategory(onServerError)
  const editing = Boolean(category)

  const submit = handleSubmit((values) => {
    const displayOrder = values.displayOrder === null ? {} : { displayOrder: values.displayOrder }
    if (category) {
      updateMutation.mutate(
        {
          id: category.id,
          input: { name: values.name, description: values.description || null, ...displayOrder },
        },
        { onSuccess: onClose },
      )
    } else {
      createMutation.mutate(
        {
          name: values.name,
          ...(values.description ? { description: values.description } : {}),
          ...displayOrder,
        },
        { onSuccess: onClose },
      )
    }
  })

  return (
    <FormModal
      open={open}
      title={editing ? 'Sửa danh mục' : 'Thêm danh mục'}
      okText={editing ? 'Lưu' : 'Thêm'}
      loading={createMutation.isPending || updateMutation.isPending}
      onCancel={onClose}
      onSubmit={submit}
    >
      <FormField control={control} name="name" label="Tên danh mục" required>
        {(field) => (
          <Input
            {...field}
            maxLength={CATEGORY_NAME_MAX}
            showCount
            placeholder="Ví dụ: Đồ chơi gỗ"
            autoFocus
          />
        )}
      </FormField>
      <FormField
        control={control}
        name="description"
        label="Mô tả"
        extra="Hiển thị cho người dùng khi chọn danh mục."
      >
        {(field) => (
          <Input.TextArea {...field} rows={3} maxLength={CATEGORY_DESCRIPTION_MAX} showCount />
        )}
      </FormField>
      <FormField
        control={control}
        name="displayOrder"
        label="Thứ tự hiển thị"
        extra={
          editing
            ? 'Số nhỏ hiển thị trước. Có thể dùng nút lên/xuống trong bảng.'
            : 'Để trống để thêm vào cuối danh sách.'
        }
      >
        {(field) => (
          <InputNumber
            ref={field.ref}
            name={field.name}
            value={field.value}
            onChange={(value) => field.onChange(value)}
            onBlur={field.onBlur}
            min={0}
            max={CATEGORY_DISPLAY_ORDER_MAX}
            precision={0}
            rootClassName="!w-52"
            placeholder="Cuối danh sách"
          />
        )}
      </FormField>
      {category && (
        <p className="m-0 text-muted">
          Đường dẫn (slug): <code>{category.slug}</code> — giữ nguyên khi đổi tên để không làm hỏng
          các liên kết đã chia sẻ.
        </p>
      )}
    </FormModal>
  )
}
