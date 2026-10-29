import { zodResolver } from '@hookform/resolvers/zod'
import { Input } from 'antd'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'

import { FormField, FormModal, ImageUploader, ReasonInput } from '../../../components/common'
import { confirmReasonPresets } from '../constants'
import { confirmReceivedSchema } from '../schemas'
import type { ConfirmReceivedValues } from '../schemas'
import type { ConfirmReceivedInput } from '../types'

interface ConfirmReceivedModalProps {
  open: boolean
  // Organization or person who received the toy.
  receiverName?: string
  loading?: boolean
  onCancel: () => void
  onSubmit: (input: ConfirmReceivedInput) => void
}

// Admin confirms, for the receiver, that the toy arrived: a required reason, optional private
// photos and a note.
export function ConfirmReceivedModal({
  open,
  receiverName,
  loading,
  onCancel,
  onSubmit,
}: ConfirmReceivedModalProps) {
  const [uploading, setUploading] = useState(false)
  const { control, handleSubmit, reset } = useForm<ConfirmReceivedValues>({
    resolver: zodResolver(confirmReceivedSchema),
    defaultValues: { reason: '', photos: [], note: '' },
  })

  useEffect(() => {
    if (open) reset({ reason: '', photos: [], note: '' })
  }, [open, reset])

  const submit = handleSubmit(({ reason, photos, note }) =>
    onSubmit({
      reason,
      ...(photos.length > 0
        ? { photos: photos.map(({ publicId, format }) => ({ publicId, format })) }
        : {}),
      ...(note ? { note } : {}),
    }),
  )

  return (
    <FormModal
      open={open}
      title={`Xác nhận ${receiverName ?? 'bên nhận'} đã nhận đồ chơi`}
      okText="Xác nhận đã nhận"
      loading={loading || uploading}
      onCancel={onCancel}
      onSubmit={submit}
    >
      <FormField control={control} name="reason" label="Lý do Admin xác nhận thay bên nhận" required>
        {(field) => (
          <ReasonInput
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            presets={confirmReasonPresets}
            disabled={loading}
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
