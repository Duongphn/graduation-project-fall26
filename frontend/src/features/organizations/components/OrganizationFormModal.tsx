import { zodResolver } from '@hookform/resolvers/zod'
import { Input, Skeleton } from 'antd'
import { useForm } from 'react-hook-form'

import { FormField, FormModal, QueryErrorAlert } from '../../../components/common'
import { useServerFieldErrors } from '../../../hooks/useServerFieldErrors'
import { useCreateOrganization, useOrganization, useUpdateOrganization } from '../hooks'
import { emptyOrganizationForm, organizationFormSchema, toFormValues, toInput } from '../schemas'
import type { OrganizationFormInput, OrganizationFormValues } from '../schemas'

interface OrganizationFormModalProps {
  open: boolean
  // Undefined: create a new organization.
  organizationId?: string
  onClose: () => void
}

// Add or edit one organization. Editing loads the detail first.
export function OrganizationFormModal({
  open,
  organizationId,
  onClose,
}: OrganizationFormModalProps) {
  const detail = useOrganization(open ? organizationId : undefined)
  const isEdit = Boolean(organizationId)
  const title = isEdit ? 'Sửa tổ chức từ thiện' : 'Thêm tổ chức từ thiện'

  if (isEdit && !detail.data) {
    return (
      <FormModal open={open} title={title} onCancel={onClose} onSubmit={() => undefined} loading>
        {detail.error ? (
          <QueryErrorAlert error={detail.error} onRetry={() => void detail.refetch()} />
        ) : (
          <Skeleton active />
        )}
      </FormModal>
    )
  }

  return (
    <OrganizationForm
      // Remount for each organization so the form starts fresh.
      key={organizationId ?? 'new'}
      open={open}
      title={title}
      organizationId={organizationId}
      initialValues={detail.data ? toFormValues(detail.data) : emptyOrganizationForm}
      onClose={onClose}
    />
  )
}

interface OrganizationFormProps {
  open: boolean
  title: string
  organizationId?: string
  initialValues: OrganizationFormInput
  onClose: () => void
}

function OrganizationForm({
  open,
  title,
  organizationId,
  initialValues,
  onClose,
}: OrganizationFormProps) {
  const { control, handleSubmit, setError } = useForm<
    OrganizationFormInput,
    unknown,
    OrganizationFormValues
  >({
    resolver: zodResolver(organizationFormSchema),
    defaultValues: initialValues,
  })
  const onError = useServerFieldErrors(setError)
  const create = useCreateOrganization(onError)
  const update = useUpdateOrganization(onError)
  const saving = create.isPending || update.isPending

  const submit = handleSubmit((values) => {
    const input = toInput(values)
    if (organizationId) update.mutate({ id: organizationId, input }, { onSuccess: onClose })
    else create.mutate(input, { onSuccess: onClose })
  })

  return (
    <FormModal
      open={open}
      title={title}
      okText={organizationId ? 'Lưu' : 'Thêm'}
      width={720}
      loading={saving}
      onCancel={onClose}
      onSubmit={submit}
    >
      <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
        <FormField control={control} name="name" label="Tên tổ chức" required>
          {(field) => <Input {...field} maxLength={150} placeholder="Mái ấm Hoa Hồng" />}
        </FormField>
        <FormField control={control} name="address" label="Địa chỉ" required>
          {(field) => <Input {...field} maxLength={300} />}
        </FormField>
      </div>
      <FormField
        control={control}
        name="contactInfo"
        label="Người liên hệ"
        required
        extra="Ví dụ: Chị Lan, phụ trách tiếp nhận"
      >
        {(field) => <Input {...field} maxLength={300} />}
      </FormField>
      <FormField control={control} name="supportCriteria" label="Tiêu chí hỗ trợ" required>
        {(field) => (
          <Input.TextArea
            {...field}
            rows={3}
            maxLength={1000}
            showCount
            placeholder="Loại đồ chơi tổ chức đang cần, tình trạng chấp nhận…"
          />
        )}
      </FormField>
    </FormModal>
  )
}
