import { CircleCheck, ImagePlus, RefreshCw, X } from 'lucide-react'
import { useEffect, useMemo, type ChangeEvent } from 'react'
import { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_BYTES } from '../../toy-listings/toy-listing-schema'
import { pickTitle } from '../identity-image-title'

interface IdentityImageSlotProps {
  id: string
  label: string
  hint: string
  file: File | null
  error?: string
  disabled?: boolean
  /** Khung ảnh chân dung cao hơn khung CCCD */
  portrait?: boolean
  onChange: (file: File | null, error?: string) => void
}

/** Một ô ảnh của hồ sơ CCCD: chọn file, kiểm tra định dạng/dung lượng như backend, xem trước, chọn lại hoặc bỏ */
export function IdentityImageSlot({ id, label, hint, file, error, disabled, portrait, onChange }: IdentityImageSlotProps) {
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => void (previewUrl && URL.revokeObjectURL(previewUrl)), [previewUrl])

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0]
    event.target.value = '' // cho phép chọn lại cùng một file
    if (!picked) return
    if (!ACCEPTED_IMAGE_TYPES.includes(picked.type)) return onChange(null, `"${picked.name}" không phải ảnh JPG, PNG hoặc WebP.`)
    if (picked.size > MAX_IMAGE_BYTES) return onChange(null, `"${picked.name}" lớn hơn 5 MB. Hãy chọn ảnh nhỏ hơn.`)
    onChange(picked)
  }

  return (
    <div className="tf-field">
      <div className="tf-field__label-row">
        <span className="tf-label">{label}</span>
        {file && (
          <span className="id-slot__picked">
            <CircleCheck aria-hidden /> Đã chọn
          </span>
        )}
      </div>
      <input id={id} type="file" accept={ACCEPTED_IMAGE_TYPES.join(',')} className="peer sr-only" onChange={handleChange} disabled={disabled} />

      {previewUrl ? (
        <div className={`id-slot id-slot--filled ${portrait ? 'id-slot--portrait' : ''}`}>
          <img src={previewUrl} alt={`Xem trước: ${label}`} className="id-slot__image" />
          <div className="id-slot__tools">
            <label htmlFor={id} className={`id-slot__tool ${disabled ? 'is-disabled' : ''}`}>
              <RefreshCw aria-hidden />
              Chọn lại
            </label>
            <button type="button" className="id-slot__tool id-slot__tool--remove" onClick={() => onChange(null)} disabled={disabled} aria-label={`Bỏ ảnh ${label.toLowerCase()}`}>
              <X aria-hidden />
            </button>
          </div>
        </div>
      ) : (
        <label
          htmlFor={id}
          className={`id-slot ${portrait ? 'id-slot--portrait' : ''} ${error ? 'is-invalid' : ''} ${disabled ? 'is-disabled' : ''}`}
        >
          <span className="id-slot__empty">
            <ImagePlus aria-hidden />
            <span className="id-slot__title">{pickTitle(label)}</span>
            <span className="id-slot__hint">{hint}</span>
          </span>
        </label>
      )}
      {error && <p className="tf-field-error">{error}</p>}
    </div>
  )
}
