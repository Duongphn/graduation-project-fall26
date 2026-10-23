import { zodResolver } from '@hookform/resolvers/zod'
import { Form, Input } from 'antd'
import { Info, PackageCheck } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import { FormField, ImageUploader } from '../../../components/common'
import { confirmReceiptSchema, type ConfirmReceiptValues } from '../schemas'
import type { HandoverInput } from '../types'

interface ConfirmReceiptFormProps {
  donorName: string
  loading: boolean
  onSubmit: (input: HandoverInput) => void
}

/** Bên nhận xác nhận đã nhận đồ chơi (SHIPPING → COMPLETED), bắt buộc ít nhất 1 ảnh lúc nhận */
export function ConfirmReceiptForm({ donorName, loading, onSubmit }: ConfirmReceiptFormProps) {
  const [uploading, setUploading] = useState(false)
  const { control, handleSubmit } = useForm<ConfirmReceiptValues>({
    resolver: zodResolver(confirmReceiptSchema),
    defaultValues: { photos: [], note: '' },
  })

  const submit = handleSubmit(({ photos, note }) =>
    onSubmit({
      photos: photos.map(({ publicId, format }) => ({ publicId, format })),
      ...(note ? { note } : {}),
    }),
  )

  return (
    <section aria-labelledby="receipt-title" className="rounded-xl border border-tf-surface bg-white p-5 sm:p-6">
      <h2 id="receipt-title" className="flex items-center gap-2 text-lg font-bold text-tf-ink">
        <PackageCheck className="size-5 text-tf-primary" aria-hidden /> Xác nhận đã nhận đồ chơi
      </h2>
      <p className="mt-3 flex gap-2 rounded-lg bg-tf-primary-fixed p-3 text-sm leading-6 text-tf-ink">
        <Info className="mt-1 size-4 shrink-0 text-tf-primary" aria-hidden />
        <span>
          <strong>{donorName}</strong> đã gửi đồ chơi. Khi nhận được, hãy chụp ảnh đồ chơi và xác nhận để hoàn tất. Sau
          khi xác nhận, yêu cầu không thể thay đổi.
        </span>
      </p>

      <Form layout="vertical" component="div" className="mt-4" disabled={loading}>
        <FormField
          control={control}
          name="photos"
          label="Ảnh đồ chơi lúc nhận"
          required
          extra="Ảnh chỉ bạn, người tặng và Admin xem được."
        >
          {(field) => (
            <ImageUploader
              purpose="HANDOVER_PHOTO"
              value={field.value}
              onChange={field.onChange}
              onUploadingChange={setUploading}
              disabled={loading}
            />
          )}
        </FormField>

        <FormField control={control} name="note" label="Lời cảm ơn hoặc ghi chú">
          {(field) => (
            <Input.TextArea {...field} rows={3} maxLength={1000} showCount placeholder="VD: Bé rất thích, cảm ơn bạn!" />
          )}
        </FormField>
      </Form>

      <button
        type="button"
        onClick={() => void submit()}
        disabled={loading || uploading}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-tf-primary px-6 text-sm font-bold text-white transition-colors hover:bg-tf-primary-container disabled:cursor-not-allowed disabled:opacity-60"
      >
        <PackageCheck className="size-4" aria-hidden />
        {loading ? 'Đang xác nhận…' : uploading ? 'Đang tải ảnh…' : 'Xác nhận đã nhận'}
      </button>
    </section>
  )
}
