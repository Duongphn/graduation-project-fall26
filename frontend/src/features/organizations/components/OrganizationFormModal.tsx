import { zodResolver } from '@hookform/resolvers/zod'
import { Checkbox, Divider, Input, Select, Skeleton, Switch } from 'antd'
import { Controller, useForm } from 'react-hook-form'

import { FormField, FormModal, QueryErrorAlert } from '../../../components/common'
import { useServerFieldErrors } from '../../../hooks/useServerFieldErrors'
import { useAdminCategoryOptions } from '../../categories/hooks'
import { organizationAgeGroups } from '../constants'
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
  const categories = useAdminCategoryOptions()
  // Active categories, plus a hidden one the organization already has (so it stays visible).
  const categoryOptions = (categories.data ?? [])
    .filter(
      (category) =>
        category.status === 'active' || initialValues.categoryIds.includes(category.id),
    )
    .map((category) => ({
      value: category.id,
      label: category.status === 'active' ? category.name : `${category.name} (đang ẩn)`,
    }))
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
        label="Liên hệ trụ sở (điện thoại hoặc email)"
        required
        extra="Chỉ Admin thấy. Ví dụ: 024 3826 1234 hoặc lienhe@maiam.vn"
      >
        {(field) => <Input {...field} maxLength={300} />}
      </FormField>
      <FormField
        control={control}
        name="verificationNote"
        label="Ghi chú xác minh"
        required
        extra="Những gì Admin đã kiểm tra trước khi thêm tổ chức: giấy phép, cuộc gọi, chuyến thăm…"
      >
        {(field) => <Input.TextArea {...field} rows={2} maxLength={500} showCount />}
      </FormField>

      <Divider titlePlacement="start">Điểm nhận đồ chơi</Divider>
      <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
        <FormField control={control} name="receivingPoint.province" label="Tỉnh/Thành phố" required>
          {(field) => <Input {...field} maxLength={100} placeholder="TP. Hồ Chí Minh" />}
        </FormField>
        <FormField control={control} name="receivingPoint.ward" label="Phường/Xã" required>
          {(field) => <Input {...field} maxLength={100} placeholder="Phường Nhiêu Lộc" />}
        </FormField>
        <FormField control={control} name="receivingPoint.street" label="Số nhà, tên đường" required>
          {(field) => <Input {...field} maxLength={120} placeholder="123 Lê Văn Sỹ" />}
        </FormField>
        <FormField control={control} name="receivingPoint.openingHours" label="Giờ nhận" required>
          {(field) => <Input {...field} maxLength={200} placeholder="Thứ 2 – Thứ 7, 8:00 – 17:00" />}
        </FormField>
        <FormField
          control={control}
          name="receivingPoint.contactName"
          label="Người liên hệ tại điểm nhận"
          required
          extra="Người tặng chỉ thấy khi yêu cầu đã được chấp nhận hoặc đang gửi."
        >
          {(field) => <Input {...field} maxLength={50} placeholder="Nguyễn Thị Lan" />}
        </FormField>
        <FormField control={control} name="receivingPoint.contactPhone" label="Số điện thoại" required>
          {(field) => <Input {...field} maxLength={12} placeholder="0912345678" />}
        </FormField>
      </div>
      <FormField control={control} name="receivingPoint.acceptsDropOff" label="Cách bàn giao" required>
        {(field) => (
          <div className="flex flex-wrap gap-4">
            <Checkbox checked={field.value} onChange={(event) => field.onChange(event.target.checked)}>
              Nhận đồ mang đến
            </Checkbox>
            <Controller
              control={control}
              name="receivingPoint.acceptsParcel"
              render={({ field: parcel }) => (
                <Checkbox
                  checked={parcel.value}
                  onChange={(event) => parcel.onChange(event.target.checked)}
                >
                  Nhận bưu kiện qua vận chuyển
                </Checkbox>
              )}
            />
          </div>
        )}
      </FormField>

      <Divider titlePlacement="start">Nhu cầu</Divider>
      <FormField control={control} name="ageGroups" label="Nhóm tuổi nhận" required>
        {(field) => (
          <Checkbox.Group
            value={field.value}
            onChange={(value) => field.onChange(value)}
            options={organizationAgeGroups.map((group) => ({ value: group.key, label: group.label }))}
          />
        )}
      </FormField>
      <FormField control={control} name="categoryIds" label="Danh mục nhận" required>
        {(field) => (
          <Select
            mode="multiple"
            value={field.value}
            onChange={(value: string[]) => field.onChange(value)}
            onBlur={field.onBlur}
            options={categoryOptions}
            loading={categories.isLoading}
            optionFilterProp="label"
            placeholder="Chọn danh mục"
          />
        )}
      </FormField>
      <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
        <FormField
          control={control}
          name="areaProvince"
          label="Khu vực hỗ trợ (tỉnh)"
          extra="Bỏ trống: tỉnh của điểm nhận."
        >
          {(field) => <Input {...field} maxLength={100} />}
        </FormField>
        <FormField control={control} name="isAccepting" label="Đang nhận đồ chơi">
          {(field) => (
            <Switch
              checked={field.value}
              onChange={(checked) => field.onChange(checked)}
              checkedChildren="Đang nhận"
              unCheckedChildren="Tạm ngừng"
            />
          )}
        </FormField>
      </div>
      <FormField control={control} name="isRemoteArea">
        {(field) => (
          <Checkbox checked={field.value} onChange={(event) => field.onChange(event.target.checked)}>
            Phục vụ vùng khó khăn, vùng sâu vùng xa (đã kiểm tra giấy tờ)
          </Checkbox>
        )}
      </FormField>
      <FormField control={control} name="supportCriteria" label="Ghi chú nhu cầu">
        {(field) => (
          <Input.TextArea
            {...field}
            rows={3}
            maxLength={1000}
            showCount
            placeholder="Thông tin thêm về đồ chơi tổ chức đang cần (không bắt buộc)"
          />
        )}
      </FormField>
    </FormModal>
  )
}
