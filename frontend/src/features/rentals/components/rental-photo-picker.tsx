import { Camera, ImagePlus, X } from 'lucide-react'
import { useId, useState, type DragEvent } from 'react'
import type { ListingPhoto } from '../../toy-listings/hooks/use-listing-photos'
import { ACCEPTED_IMAGE_TYPES, MAX_IMAGES } from '../../toy-listings/toy-listing-schema'
import { hasImageSignature } from '../../../utils/image-signature'

interface RentalPhotoPickerProps {
  label: string
  photos: ListingPhoto[]
  rejections: string[]
  /** Báo khi bấm xác nhận mà chưa chọn ảnh nào */
  missing?: boolean
  disabled?: boolean
  onAddFiles: (files: FileList | File[]) => void
  onRemove: (key: string) => void
}

/** Báo file mang đuôi ảnh nhưng nội dung không phải ảnh (vd. đổi tên .txt thành .png) */
const fakeImageMessage = (name: string) => `"${name}" bị hỏng hoặc không phải ảnh JPG, PNG, WebP thật.`

/**
 * Chọn ảnh tình trạng đồ chơi trên máy để gửi kèm bước giao/nhận/trả (multipart `photos`, 1–10 ảnh).
 * Chưa có ảnh: một vùng thả ảnh lớn; đã có: lưới ảnh nhỏ + ô thêm.
 * File có đuôi ảnh nhưng nội dung không khớp chữ ký JPG/PNG/WebP bị loại ngay, như server kiểm tra.
 */
export function RentalPhotoPicker({
  label,
  photos,
  rejections,
  missing,
  disabled,
  onAddFiles,
  onRemove,
}: RentalPhotoPickerProps) {
  const inputId = useId()
  const hintId = `${inputId}-hint`
  const [isDragging, setIsDragging] = useState(false)
  const [fakeFiles, setFakeFiles] = useState<string[]>([])
  const canAdd = !disabled && photos.length < MAX_IMAGES

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files)
    const genuine = await Promise.all(list.map(hasImageSignature))
    setFakeFiles(list.filter((_, index) => !genuine[index]).map((file) => fakeImageMessage(file.name)))
    onAddFiles(list.filter((_, index) => genuine[index]))
  }

  const remove = (key: string) => {
    setFakeFiles([])
    onRemove(key)
  }
  const errors = [...fakeFiles, ...rejections]

  const dragProps = {
    onDragOver: (event: DragEvent<HTMLElement>) => {
      event.preventDefault()
      if (canAdd) setIsDragging(true)
    },
    onDragLeave: () => setIsDragging(false),
    onDrop: (event: DragEvent<HTMLElement>) => {
      event.preventDefault()
      setIsDragging(false)
      if (canAdd) void addFiles(event.dataTransfer.files)
    },
  }

  return (
    <div className="rental-photos">
      <div className="rental-photos__head">
        <span className="rental-photos__label">{label}</span>
        <span className="rental-photos__count" aria-live="polite">
          {photos.length}/{MAX_IMAGES} ảnh
        </span>
      </div>

      <input
        id={inputId}
        type="file"
        multiple
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        disabled={!canAdd}
        aria-describedby={photos.length === 0 ? hintId : undefined}
        className="sr-only"
        onChange={(event) => {
          if (event.target.files) void addFiles(event.target.files)
          event.target.value = '' // cho phép chọn lại đúng file vừa xoá
        }}
      />

      {photos.length === 0 ? (
        <label
          htmlFor={inputId}
          className={`rental-photos__drop ${isDragging ? 'is-dragging' : ''} ${missing ? 'is-invalid' : ''} ${canAdd ? '' : 'is-disabled'}`}
          {...dragProps}
        >
          <Camera aria-hidden />
          <span className="rental-photos__drop-title">Chụp hoặc chọn ảnh</span>
          <span id={hintId} className="rental-photos__drop-hint">
            JPG, PNG, WebP · tối đa 5 MB mỗi ảnh
          </span>
        </label>
      ) : (
        <ul className="rental-photos__grid" {...dragProps}>
          {photos.map((photo, index) => (
            <li key={photo.key} className="rental-photos__tile">
              <img src={photo.url} alt={`Ảnh tình trạng ${index + 1}`} />
              <button
                type="button"
                className="rental-photos__remove"
                onClick={() => remove(photo.key)}
                disabled={disabled}
                aria-label={`Bỏ ảnh ${index + 1}`}
              >
                <X aria-hidden />
              </button>
            </li>
          ))}
          {photos.length < MAX_IMAGES && (
            <li>
              <label htmlFor={inputId} className={`rental-photos__add ${canAdd ? '' : 'is-disabled'}`}>
                <ImagePlus aria-hidden />
                <span>Thêm</span>
              </label>
            </li>
          )}
        </ul>
      )}

      {(missing || errors.length > 0) && (
        <ul className="rental-photos__errors" role="alert">
          {missing && <li>Cần ít nhất 1 ảnh tình trạng đồ chơi.</li>}
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
