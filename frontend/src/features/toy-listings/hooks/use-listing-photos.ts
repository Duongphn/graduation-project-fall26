import { useCallback, useEffect, useRef, useState } from 'react'
import type { ToyImage } from '../toy-listing-api'
import { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_IMAGES } from '../toy-listing-schema'

export type ListingPhoto =
  | { kind: 'existing'; key: string; url: string; publicId: string }
  | { kind: 'new'; key: string; url: string; file: File }

function toExistingPhotos(images: ToyImage[]): ListingPhoto[] {
  return images.map((image) => ({ kind: 'existing', key: image.publicId, ...image }))
}

function revokeNewPhotoUrls(photos: ListingPhoto[]) {
  photos.forEach((photo) => photo.kind === 'new' && URL.revokeObjectURL(photo.url))
}

/** Số ảnh tối đa và định dạng nhận được; mặc định là giới hạn chung (form quyên góp dùng) */
export interface PhotoRules {
  maxImages: number
  acceptedTypes: readonly string[]
}

const DEFAULT_RULES: PhotoRules = { maxImages: MAX_IMAGES, acceptedTypes: ACCEPTED_IMAGE_TYPES }

/** Tên các định dạng để báo lỗi, vd. "JPG hoặc PNG" */
export const formatNames = (types: readonly string[]) =>
  types
    .map((type) => (type === 'image/jpeg' ? 'JPG' : type === 'image/webp' ? 'WebP' : type.replace('image/', '').toUpperCase()))
    .join(', ')
    .replace(/, ([^,]*)$/, ' hoặc $1')

/**
 * Ảnh đã lưu trên Cloudinary và ảnh mới chọn nằm chung một danh sách để hiển thị,
 * nhưng khi gửi PATCH backend cần tách: file mới (`images`) và publicId cần xoá.
 */
export function useListingPhotos(initialImages: ToyImage[], rules: PhotoRules = DEFAULT_RULES) {
  const { maxImages, acceptedTypes } = rules
  const [photos, setPhotos] = useState<ListingPhoto[]>(() => toExistingPhotos(initialImages))
  const [removedPublicIds, setRemovedPublicIds] = useState<string[]>([])
  const [rejections, setRejections] = useState<string[]>([])

  // Giữ bản mới nhất để thu hồi object URL khi unmount
  const photosRef = useRef(photos)
  useEffect(() => {
    photosRef.current = photos
  }, [photos])
  useEffect(() => () => revokeNewPhotoUrls(photosRef.current), [])

  const addFiles = useCallback((files: FileList | File[]) => {
    const problems: string[] = []
    const accepted: ListingPhoto[] = []
    const slotsLeft = maxImages - photosRef.current.length

    for (const file of Array.from(files)) {
      if (!acceptedTypes.includes(file.type)) {
        problems.push(`"${file.name}" không phải ảnh ${formatNames(acceptedTypes)}.`)
      } else if (file.size > MAX_IMAGE_BYTES) {
        problems.push(`"${file.name}" lớn hơn 5 MB.`)
      } else if (accepted.length >= slotsLeft) {
        problems.push(`Chỉ đăng được tối đa ${maxImages} ảnh, đã bỏ qua "${file.name}".`)
      } else {
        accepted.push({ kind: 'new', key: crypto.randomUUID(), url: URL.createObjectURL(file), file })
      }
    }

    setRejections(problems)
    if (accepted.length > 0) setPhotos((current) => [...current, ...accepted])
  }, [maxImages, acceptedTypes])

  const removePhoto = useCallback((key: string) => {
    const target = photosRef.current.find((photo) => photo.key === key)
    if (!target) return
    if (target.kind === 'new') URL.revokeObjectURL(target.url)
    else setRemovedPublicIds((ids) => [...ids, target.publicId])
    setPhotos((current) => current.filter((photo) => photo.key !== key))
    setRejections([])
  }, [])

  /** Đưa ảnh lên đầu danh sách để làm ảnh chính (chỉ có tác dụng với ảnh chưa tải lên) */
  const makeCover = useCallback((key: string) => {
    setPhotos((current) => {
      const target = current.find((photo) => photo.key === key)
      return target ? [target, ...current.filter((photo) => photo.key !== key)] : current
    })
  }, [])

  /** Đưa về đúng tập ảnh đã lưu (sau khi lưu thành công hoặc khi người dùng hoàn tác) */
  const resetTo = useCallback((images: ToyImage[]) => {
    revokeNewPhotoUrls(photosRef.current)
    setPhotos(toExistingPhotos(images))
    setRemovedPublicIds([])
    setRejections([])
  }, [])

  const newFiles = photos.flatMap((photo) => (photo.kind === 'new' ? [photo.file] : []))
  const isDirty = removedPublicIds.length > 0 || newFiles.length > 0

  return { photos, newFiles, removedPublicIds, rejections, isDirty, addFiles, removePhoto, makeCover, resetTo }
}
