import { zodResolver } from '@hookform/resolvers/zod'
import { Form, Input, Radio, Select } from 'antd'
import { Info, Send, Truck } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'

import { FormField, ImageUploader } from '../../../components/common'
import { handoverMethodLabels, handoverMethods, shippingCarriers } from '../constants'
import { composeHandoverNote, shipDonationSchema, type ShipDonationValues } from '../schemas'
import type { HandoverInput } from '../types'

interface ShipDonationFormProps {
  receiverName: string
  loading: boolean
  onSubmit: (input: HandoverInput) => void
}

const carrierOptions = shippingCarriers.map((carrier) => ({ value: carrier, label: carrier }))

/** Donor đánh dấu "Đã gửi hàng" (ACCEPTED → SHIPPING): cách gửi, mã vận đơn, ảnh kiện hàng */
export function ShipDonationForm({ receiverName, loading, onSubmit }: ShipDonationFormProps) {
  const [uploading, setUploading] = useState(false)
  const { control, handleSubmit } = useForm<ShipDonationValues>({
    resolver: zodResolver(shipDonationSchema),
    defaultValues: { method: 'CARRIER', carrier: '', trackingCode: '', photos: [], note: '' },
  })
  const method = useWatch({ control, name: 'method' })

  const submit = handleSubmit((values) =>
    onSubmit({
      photos: values.photos.map(({ publicId, format }) => ({ publicId, format })),
      note: composeHandoverNote(values),
    }),
  )

  return (
    <section aria-labelledby="ship-title" className="rounded-xl border border-tf-surface bg-white p-5 sm:p-6">
      <h2 id="ship-title" className="flex items-center gap-2 text-lg font-bold text-tf-ink">
        <Truck className="size-5 text-tf-primary" aria-hidden /> Cập nhật trạng thái gửi hàng
      </h2>
      <p className="mt-3 flex gap-2 rounded-lg bg-tf-primary-fixed p-3 text-sm leading-6 text-tf-ink">
        <Info className="mt-1 size-4 shrink-0 text-tf-primary" aria-hidden />
        <span>
          Đóng gói đồ chơi, gửi cho <strong>{receiverName}</strong> rồi nhập mã vận đơn và ảnh biên nhận để bên nhận
          theo dõi. Sau khi xác nhận đã gửi, bạn không thể tự huỷ phiếu nữa.
        </span>
      </p>

      <Form layout="vertical" component="div" className="mt-4" disabled={loading}>
        <FormField control={control} name="method" label="Cách bàn giao" required>
          {(field) => (
            <Radio.Group
              value={field.value}
              onChange={(event) => field.onChange(event.target.value)}
              options={handoverMethods.map((value) => ({ value, label: handoverMethodLabels[value] }))}
            />
          )}
        </FormField>

        {method === 'CARRIER' && (
          <div className="grid gap-x-4 sm:grid-cols-2">
            <FormField control={control} name="carrier" label="Đơn vị vận chuyển" required>
              {(field) => (
                <Select
                  value={field.value || undefined}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  options={carrierOptions}
                  placeholder="Chọn đơn vị đã gửi"
                />
              )}
            </FormField>
            <FormField control={control} name="trackingCode" label="Mã vận đơn" required>
              {(field) => (
                <Input {...field} maxLength={30} placeholder="VD: GHNHCM88492048VN" autoComplete="off" />
              )}
            </FormField>
          </div>
        )}

        <FormField
          control={control}
          name="photos"
          label={method === 'CARRIER' ? 'Ảnh biên nhận gửi hàng / kiện hàng' : 'Ảnh lúc bàn giao đồ chơi'}
          required
          extra="Ảnh chỉ bạn, bên nhận và Admin xem được."
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

        <FormField control={control} name="note" label="Lời nhắn cho bên nhận">
          {(field) => (
            <Input.TextArea {...field} rows={3} maxLength={600} showCount placeholder="VD: Hàng dễ vỡ, nhờ nhận giúp trong giờ hành chính." />
          )}
        </FormField>
      </Form>

      <button
        type="button"
        onClick={() => void submit()}
        disabled={loading || uploading}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-tf-primary px-6 text-sm font-bold text-white transition-colors hover:bg-tf-primary-container disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Send className="size-4" aria-hidden />
        {loading ? 'Đang xác nhận…' : uploading ? 'Đang tải ảnh…' : 'Xác nhận đã gửi hàng'}
      </button>
    </section>
  )
}
