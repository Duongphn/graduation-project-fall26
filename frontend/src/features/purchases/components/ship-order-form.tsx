import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ImagePlus, Truck, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'

import { getErrorMessage } from '../../../services/api-error'
import { uploadImage, UploadTooLargeError } from '../../../services/upload'
import { purchaseApi, type PurchaseOrder } from '../purchase-api'
import { CARRIERS, HAND_DELIVERY } from '../purchase-display'
import { formatDateTime } from '../../rentals/rental-display'
import { validateShip, type ShipFieldErrors } from '../purchase-forms'
import { purchaseKeys } from '../purchase-queries'

const MAX_PHOTOS = 5
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp']

interface PickedPhoto {
  key: string
  file: File
  preview: string
}

const inputClass = (invalid: boolean) =>
  `mt-1 h-11 w-full rounded-lg border bg-white px-3 text-base text-tf-ink outline-none focus:ring-2 focus:ring-tf-primary/30 ${
    invalid ? 'border-red-500' : 'border-tf-outline'
  }`

/**
 * UC13 người bán: chọn đơn vị vận chuyển, nhập mã vận đơn, thêm ảnh đóng gói → tải ảnh lên Cloudinary
 * (ảnh công khai TOY_PHOTO để người mua xem được) → POST /purchase-orders/:id/ship (PAID → SHIPPING).
 */
export function ShipOrderForm({ order }: { order: PurchaseOrder }) {
  const queryClient = useQueryClient()
  const ids = { carrier: useId(), tracking: useId(), photos: useId(), note: useId() }
  const fileInput = useRef<HTMLInputElement>(null)
  const pickup = order.deliveryMethod === 'LOCAL_PICKUP'
  const [carrierName, setCarrierName] = useState(pickup ? HAND_DELIVERY : '')
  const [trackingCode, setTrackingCode] = useState('')
  const [note, setNote] = useState('')
  const [photos, setPhotos] = useState<PickedPhoto[]>([])
  const [errors, setErrors] = useState<ShipFieldErrors>({})
  const [progress, setProgress] = useState<string>()

  // Thu hồi ảnh xem trước khi rời trang
  const photosRef = useRef(photos)
  useEffect(() => {
    photosRef.current = photos
  })
  useEffect(() => () => photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.preview)), [])

  const ship = useMutation({
    mutationFn: async () => {
      const uploaded = []
      for (const [index, photo] of photos.entries()) {
        setProgress(`Đang tải ảnh ${index + 1}/${photos.length}…`)
        const image = await uploadImage(photo.file, 'TOY_PHOTO')
        uploaded.push({ url: image.url, publicId: image.publicId })
      }
      setProgress('Đang xác nhận gửi hàng…')
      return purchaseApi.ship(order.id, {
        carrierName,
        trackingCode: trackingCode.trim() || undefined,
        photos: uploaded,
        note: note.trim() || undefined,
      })
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(purchaseKeys.detail(order.id), updated)
      void queryClient.invalidateQueries({ queryKey: purchaseKeys.all })
    },
    onSettled: () => setProgress(undefined),
  })

  const addFiles = (files: FileList | null) => {
    if (!files) return
    const accepted = Array.from(files).filter((file) => ACCEPTED.includes(file.type))
    const room = MAX_PHOTOS - photos.length
    const next = accepted.slice(0, room).map((file) => ({
      key: `${file.name}-${file.lastModified}-${Math.random()}`,
      file,
      preview: URL.createObjectURL(file),
    }))
    setPhotos((current) => [...current, ...next])
    setErrors((current) => ({
      ...current,
      photos:
        accepted.length < files.length
          ? 'Chỉ nhận ảnh JPG, PNG hoặc WebP.'
          : accepted.length > room
            ? `Tối đa ${MAX_PHOTOS} ảnh.`
            : undefined,
    }))
  }

  const removePhoto = (key: string) =>
    setPhotos((current) => {
      const photo = current.find((item) => item.key === key)
      if (photo) URL.revokeObjectURL(photo.preview)
      return current.filter((item) => item.key !== key)
    })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const found = validateShip({ carrierName, trackingCode, photoCount: photos.length, note }, order.deliveryMethod)
    setErrors(found)
    if (Object.keys(found).length === 0) ship.mutate()
  }

  const needsTracking = !pickup && carrierName !== HAND_DELIVERY
  const shipError = ship.error
    ? ship.error instanceof UploadTooLargeError
      ? `${ship.error.message} Hãy chọn ảnh nhỏ hơn.`
      : getErrorMessage(ship.error, 'Không xác nhận được. Vui lòng thử lại.')
    : undefined

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4" aria-labelledby="ship-form-title">
      <h2 id="ship-form-title" className="flex items-center gap-2 text-base font-bold text-tf-ink">
        <Truck className="size-5 text-tf-primary" aria-hidden /> Xác nhận đã gửi hàng
      </h2>
      {order.timer?.dueAt && (
        <p className="-mt-2 text-sm text-amber-800">Hạn gửi hàng: {formatDateTime(order.timer.dueAt)}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={ids.carrier} className="text-sm font-semibold text-tf-ink">
            {pickup ? 'Cách bàn giao' : 'Đơn vị vận chuyển'}
          </label>
          <select
            id={ids.carrier}
            value={carrierName}
            onChange={(event) => {
              setCarrierName(event.target.value)
              setErrors((current) => ({ ...current, carrierName: undefined, trackingCode: undefined }))
            }}
            aria-invalid={Boolean(errors.carrierName)}
            className={inputClass(Boolean(errors.carrierName))}
          >
            <option value="">Chọn đơn vị</option>
            {CARRIERS.map((carrier) => (
              <option key={carrier} value={carrier}>
                {carrier}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-red-600 empty:hidden">{errors.carrierName}</p>
        </div>

        <div>
          <label htmlFor={ids.tracking} className="text-sm font-semibold text-tf-ink">
            Mã vận đơn{needsTracking ? '' : ' (không bắt buộc)'}
          </label>
          <input
            id={ids.tracking}
            value={trackingCode}
            onChange={(event) => {
              setTrackingCode(event.target.value)
              setErrors((current) => ({ ...current, trackingCode: undefined }))
            }}
            aria-invalid={Boolean(errors.trackingCode)}
            placeholder="Ví dụ: GHN123456789"
            className={`${inputClass(Boolean(errors.trackingCode))} uppercase`}
          />
          <p className="mt-1 text-xs text-red-600 empty:hidden">{errors.trackingCode}</p>
        </div>
      </div>

      <div>
        <span id={ids.photos} className="text-sm font-semibold text-tf-ink">
          Ảnh đóng gói hoặc bàn giao <span className="font-normal text-tf-ink-muted">({photos.length}/{MAX_PHOTOS})</span>
        </span>
        <div role="group" aria-labelledby={ids.photos} className="mt-2 flex flex-wrap gap-2">
          {photos.map((photo, index) => (
            <span key={photo.key} className="relative size-20 overflow-hidden rounded-lg border border-tf-surface">
              <img src={photo.preview} alt={`Ảnh ${index + 1}`} className="size-full object-cover" />
              <button
                type="button"
                onClick={() => removePhoto(photo.key)}
                disabled={ship.isPending}
                aria-label={`Bỏ ảnh ${index + 1}`}
                className="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </span>
          ))}
          {photos.length < MAX_PHOTOS && (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={ship.isPending}
              className={`grid size-20 place-items-center rounded-lg border border-dashed text-tf-ink-muted hover:border-tf-primary hover:text-tf-primary ${
                errors.photos ? 'border-red-500' : 'border-tf-outline'
              }`}
            >
              <span className="flex flex-col items-center gap-1 text-[11px] font-semibold">
                <ImagePlus className="size-5" aria-hidden /> Thêm ảnh
              </span>
            </button>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPTED.join(',')}
          multiple
          hidden
          aria-label="Chọn ảnh đóng gói"
          onChange={(event) => {
            addFiles(event.target.files)
            event.target.value = ''
          }}
        />
        <p className="mt-1 text-xs text-red-600 empty:hidden">{errors.photos}</p>
      </div>

      <div>
        <label htmlFor={ids.note} className="text-sm font-semibold text-tf-ink">
          Ghi chú cho người mua (không bắt buộc)
        </label>
        <textarea
          id={ids.note}
          rows={2}
          maxLength={500}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className={`${inputClass(Boolean(errors.note))} h-auto py-2`}
        />
      </div>

      {shipError && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {shipError}
        </p>
      )}

      <button
        type="submit"
        disabled={ship.isPending}
        className="inline-flex h-11 items-center justify-center self-start rounded-full bg-tf-primary px-6 text-sm font-bold text-white hover:bg-tf-primary-container disabled:opacity-60"
      >
        {ship.isPending ? (progress ?? 'Đang gửi…') : 'Xác nhận đã gửi hàng'}
      </button>
    </form>
  )
}
