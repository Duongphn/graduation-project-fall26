import { Camera, CloudUpload, Images, ImagePlus, Star, X } from 'lucide-react'
import { useState, type DragEvent } from 'react'
import { RequiredMark, SectionTitle } from './listing-form-primitives'
import type { ListingPhoto } from '../hooks/use-listing-photos'
import { ACCEPTED_IMAGE_TYPES, MAX_IMAGES } from '../toy-listing-schema'

interface ListingPhotoUploaderProps {
  photos: ListingPhoto[]
  rejections: string[]
  /** Lỗi khi bấm lưu mà chưa có ảnh nào */
  requiredError?: string
  /** Chỉ sắp xếp được ảnh chưa tải lên (backend luôn nối ảnh mới sau ảnh cũ) */
  canReorder: boolean
  disabled?: boolean
  onAddFiles: (files: FileList | File[]) => void
  onRemove: (key: string) => void
  onMakeCover: (key: string) => void
}

const INPUT_ID = 'listing-photo-input'

export function ListingPhotoUploader({
  photos,
  rejections,
  requiredError,
  canReorder,
  disabled,
  onAddFiles,
  onRemove,
  onMakeCover,
}: ListingPhotoUploaderProps) {
  const [isDragging, setIsDragging] = useState(false)
  const canAdd = !disabled && photos.length < MAX_IMAGES

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    setIsDragging(false)
    if (canAdd) onAddFiles(event.dataTransfer.files)
  }

  return (
    <section className="tf-card">
      <div className="tf-card__head tf-card__head--wrap">
        <div>
          <SectionTitle icon={<Images aria-hidden />}>
            Ảnh đồ chơi thực tế
            <RequiredMark />
          </SectionTitle>
          <p className="tf-card__subtitle">
            JPG, PNG hoặc WebP · tối đa 5 MB mỗi ảnh · từ 1 đến {MAX_IMAGES} ảnh
          </p>
        </div>
        <span className="tf-pill tf-pill--primary">
          <Camera aria-hidden />
          Tối đa {MAX_IMAGES} ảnh
        </span>
      </div>

      <input
        id={INPUT_ID}
        type="file"
        multiple
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        disabled={!canAdd}
        className="sr-only"
        onChange={(event) => {
          if (event.target.files) onAddFiles(event.target.files)
          event.target.value = '' // cho phép chọn lại đúng file vừa xoá
        }}
      />

      <label
        htmlFor={INPUT_ID}
        className={`photo-dropzone ${isDragging ? 'is-dragging' : ''} ${requiredError ? 'is-invalid' : ''} ${canAdd ? '' : 'is-disabled'}`}
        onDragOver={(event) => {
          event.preventDefault()
          if (canAdd) setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <span className="photo-dropzone__icon">
          <CloudUpload aria-hidden />
        </span>
        <span className="photo-dropzone__title">
          Kéo thả ảnh vào đây, hoặc <span className="photo-dropzone__link">chọn từ thiết bị</span>
        </span>
        <span className="photo-dropzone__hint">Hỗ trợ JPG, PNG hoặc WebP · tối đa 5 MB mỗi ảnh · tối đa {MAX_IMAGES} ảnh</span>
      </label>

      {photos.length > 0 && (
        <ul className="photo-grid">
          {photos.map((photo, index) => (
            <li key={photo.key} className="photo-tile">
              <img src={photo.url} alt={`Ảnh đồ chơi ${index + 1}`} className="photo-tile__image" />
              {index === 0 && (
                <span className="photo-tile__cover">
                  <Star aria-hidden /> Ảnh chính
                </span>
              )}
              <button
                type="button"
                className="photo-tile__remove"
                onClick={() => onRemove(photo.key)}
                disabled={disabled}
                aria-label={`Xoá ảnh ${index + 1}`}
                title="Xóa ảnh này"
              >
                <X aria-hidden />
              </button>
              {index > 0 && canReorder && (
                <button type="button" className="photo-tile__make-cover" onClick={() => onMakeCover(photo.key)} disabled={disabled}>
                  Đặt làm ảnh chính
                </button>
              )}
            </li>
          ))}

          {photos.length < MAX_IMAGES && (
            <li>
              <label htmlFor={INPUT_ID} className={`photo-tile photo-tile--add ${disabled ? 'is-disabled' : ''}`}>
                <ImagePlus aria-hidden />
                <span className="photo-tile__add-label">+ Thêm ảnh</span>
                <span className="photo-tile__add-count">
                  (Đã tải {photos.length}/{MAX_IMAGES})
                </span>
              </label>
            </li>
          )}
        </ul>
      )}

      {(requiredError || rejections.length > 0) && (
        <ul className="photo-errors" role="alert">
          {requiredError && <li>{requiredError}</li>}
          {rejections.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
