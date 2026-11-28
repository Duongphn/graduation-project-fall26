import { zodResolver } from '@hookform/resolvers/zod'
import { DatePicker, Input, Select } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useEffect, useState } from 'react'
import { useForm, type DefaultValues } from 'react-hook-form'

import { FormField, FormModal, ImageUploader } from '../../../components/common'
import { receiptChannelLabels } from '../constants'
import { organizationReceiptSchema } from '../schemas'
import type { OrganizationReceiptInput, OrganizationReceiptValues } from '../schemas'
import type { ConfirmReceivedInput, ReceiptChannel } from '../types'

interface OrganizationReceiptModalProps {
  open: boolean
  organizationName?: string
  // When the Donor sent the toy: the received date cannot be earlier.
  sentAt?: string
  loading?: boolean
  onCancel: () => void
  onSubmit: (input: ConfirmReceivedInput) => void
}

// No channel until the Admin picks one.
const emptyReceipt: DefaultValues<OrganizationReceiptInput> = {
  confirmedBy: '',
  receivedAt: '',
  photos: [],
  note: '',
}

const channelOptions = (Object.keys(receiptChannelLabels) as ReceiptChannel[]).map((value) => ({
  value,
  label: receiptChannelLabels[value],
}))

// GB-59 (R03 III.7.5.2 (8)–(10)): the Admin records the organization's confirmation of receipt:
// the person who confirmed, the channel, the received date and at least one receipt photo.
export function OrganizationReceiptModal({
  open,
  organizationName,
  sentAt,
  loading,
  onCancel,
  onSubmit,
}: OrganizationReceiptModalProps) {
  const [uploading, setUploading] = useState(false)
  const { control, handleSubmit, reset } = useForm<
    OrganizationReceiptInput,
    unknown,
    OrganizationReceiptValues
  >({
    resolver: zodResolver(organizationReceiptSchema),
    defaultValues: emptyReceipt,
  })

  useEffect(() => {
    if (open) reset(emptyReceipt)
  }, [open, reset])

  const earliest = sentAt ? dayjs(sentAt).startOf('day') : undefined
  const disabledDate = (date: Dayjs) =>
    date.isAfter(dayjs(), 'day') || (earliest ? date.isBefore(earliest, 'day') : false)

  const submit = handleSubmit(({ confirmedBy, channel, receivedAt, photos, note }) =>
    onSubmit({
      confirmedBy,
      channel,
      receivedAt,
      ...(photos.length > 0 ? { photos: photos.map(({ publicId, format }) => ({ publicId, format })) } : {}),
      ...(note ? { note } : {}),
    }),
  )

  return (
    <FormModal
      open={open}
      title={`Ghi nhận ${organizationName ?? 'tổ chức'} đã nhận đồ chơi`}
      okText="Xác nhận đã nhận"
      loading={loading || uploading}
      onCancel={onCancel}
      onSubmit={submit}
    >
      <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
        <FormField control={control} name="confirmedBy" label="Người xác nhận" required>
          {(field) => <Input {...field} maxLength={100} placeholder="Tên người của tổ chức" />}
        </FormField>
        <FormField control={control} name="channel" label="Kênh xác nhận" required>
          {(field) => (
            <Select
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              options={channelOptions}
              placeholder="Điện thoại, email hoặc trực tiếp"
            />
          )}
        </FormField>
      </div>
      <FormField control={control} name="receivedAt" label="Ngày nhận" required>
        {(field) => (
          <DatePicker
            className="w-full"
            format="DD/MM/YYYY"
            placeholder="Chọn ngày"
            value={field.value ? dayjs(field.value) : null}
            onChange={(date: Dayjs | null) => field.onChange(date ? date.format('YYYY-MM-DD') : '')}
            onBlur={field.onBlur}
            disabledDate={disabledDate}
          />
        )}
      </FormField>
      <FormField control={control} name="photos" label="Ảnh nhận hàng (không bắt buộc)">
        {(field) => (
          <ImageUploader
            purpose="HANDOVER_PHOTO"
            value={field.value}
            onChange={field.onChange}
            onUploadingChange={setUploading}
          />
        )}
      </FormField>
      <FormField control={control} name="note" label="Ghi chú">
        {(field) => <Input.TextArea {...field} rows={3} maxLength={1000} showCount />}
      </FormField>
    </FormModal>
  )
}
