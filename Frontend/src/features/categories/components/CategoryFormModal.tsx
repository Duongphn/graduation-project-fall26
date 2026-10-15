import { zodResolver } from '@hookform/resolvers/zod'
import { App, Input, InputNumber } from 'antd'
import { useCallback, useRef } from 'react'
import { useForm } from 'react-hook-form'

import { FormField, FormModal } from '../../../components/common'
import { useServerFieldErrors } from '../../../hooks/useServerFieldErrors'
import { ApiError } from '../../../services/api-error'
import { normalizeText } from '../../../utils/text'
import { useCreateCategory, useUpdateCategory } from '../hooks'
import {
  CATEGORY_DESCRIPTION_MAX,
  CATEGORY_DISPLAY_ORDER_MAX,
  CATEGORY_NAME_MAX,
  categoryFormSchema,
} from '../schemas'
import type { CategoryFormValues } from '../schemas'
import type { AdminCategory, CategoryUpdateInput } from '../types'

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
  const {
    control,
    handleSubmit,
    setError,
    formState: { isDirty },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: toFormValues(category),
  })
  const { message } = App.useApp()
  const applyFieldErrors = useServerFieldErrors(setError)
  // 404: another Admin deleted the category meanwhile. The list refetches (refetchOnStale) and
  // the form closes; the backend message is still shown.
  const onServerError = useCallback(
    (error: unknown) => {
      if (error instanceof ApiError && error.status === 404) {
        onClose()
        return false
      }
      return applyFieldErrors(error)
    },
    [applyFieldErrors, onClose],
  )
  const createMutation = useCreateCategory(onServerError)
  const updateMutation = useUpdateCategory(onServerError)
  const editing = Boolean(category)
  // Set synchronously before validation, so a double click or Enter during the save (before
  // isPending reaches the button) never sends a second request.
  const submittingRef = useRef(false)
  const release = () => {
    submittingRef.current = false
  }

  const onValid = (values: CategoryFormValues) => {
    const displayOrder = values.displayOrder === null ? {} : { displayOrder: values.displayOrder }
    if (category) {
      if (values.displayOrder === null) {
        setError('displayOrder', { message: 'Nhập thứ tự hiển thị.' })
        return release()
      }
      // Only the fields whose normalised value differs (the server normalises the same way),
      // so saving does not touch what the Admin left as is.
      const description = values.description || null
      const input: CategoryUpdateInput = {
        ...(values.name !== normalizeText(category.name) ? { name: values.name } : {}),
        ...(description !== (category.description?.trim() || null) ? { description } : {}),
        ...(values.displayOrder !== category.displayOrder ? displayOrder : {}),
      }
      if (Object.keys(input).length === 0) {
        message.info('Không có thay đổi.')
        release()
        return onClose()
      }
      updateMutation.mutate({ id: category.id, input }, { onSuccess: onClose, onSettled: release })
    } else {
      createMutation.mutate(
        {
          name: values.name,
          ...(values.description ? { description: values.description } : {}),
          ...displayOrder,
        },
        { onSuccess: onClose, onSettled: release },
      )
    }
  }

  const submit = () => {
    if (submittingRef.current || createMutation.isPending || updateMutation.isPending) return
    submittingRef.current = true
    void handleSubmit(onValid, release)()
  }

  return (
    <FormModal
      open={open}
      title={editing ? 'Sửa danh mục' : 'Thêm danh mục'}
      okText={editing ? 'Lưu' : 'Thêm'}
      loading={createMutation.isPending || updateMutation.isPending}
      okDisabled={editing && !isDirty}
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
          Đường dẫn: <code>{category.slug}</code> — giữ nguyên khi đổi tên để không làm hỏng
          các liên kết đã chia sẻ.
        </p>
      )}
    </FormModal>
  )
}
