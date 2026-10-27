import { z } from 'zod'

export const TITLE_MAX_LENGTH = 100
export const DESCRIPTION_MIN_LENGTH = 50
export const DESCRIPTION_MAX_LENGTH = 1000

/** Giới hạn ảnh khớp với multer + validateToyImage ở backend */
export const MIN_IMAGES = 1
export const MAX_IMAGES = 10
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/** Backend lưu `condition` dạng chuỗi tự do; dùng nhãn cố định để dữ liệu đồng nhất */
export const CONDITION_OPTIONS = [
  { value: 'Mới', hint: 'Brand new nguyên hộp' },
  { value: 'Như mới (90–99%)', hint: 'Đầy đủ hộp & sách' },
  { value: 'Tốt (70–89%)', hint: 'Đã qua sử dụng' },
  { value: 'Cũ nhiều', hint: 'Chức năng bình thường' },
] as const

/** Backend lưu ageRange { minAge, maxAge } theo năm */
export const AGE_OPTIONS = [
  { label: '0 - 12 tháng tuổi', minAge: 0, maxAge: 1 },
  { label: '1 - 3 tuổi (Mầm non)', minAge: 1, maxAge: 3 },
  { label: '3 - 6 tuổi (Mẫu giáo)', minAge: 3, maxAge: 6 },
  { label: '6 - 12 tuổi (Tiểu học)', minAge: 6, maxAge: 12 },
  { label: '12+ tuổi & Ba mẹ sưu tầm', minAge: 12, maxAge: 99 },
] as const

export const listingSchema = z
  .object({
    listingType: z.enum(['rent', 'sell']),
    title: z
      .string()
      .trim()
      .min(5, 'Tên đồ chơi tối thiểu 5 ký tự')
      .max(TITLE_MAX_LENGTH, `Tên đồ chơi tối đa ${TITLE_MAX_LENGTH} ký tự`),
    categoryId: z.string().min(1, 'Vui lòng chọn danh mục'),
    minAge: z.number({ error: 'Vui lòng chọn độ tuổi' }).int().min(0),
    maxAge: z.number({ error: 'Vui lòng chọn độ tuổi' }).int().min(0),
    condition: z.string().min(1, 'Vui lòng chọn tình trạng'),
    description: z
      .string()
      .trim()
      .min(DESCRIPTION_MIN_LENGTH, `Mô tả tối thiểu ${DESCRIPTION_MIN_LENGTH} ký tự`)
      .max(DESCRIPTION_MAX_LENGTH, `Mô tả tối đa ${DESCRIPTION_MAX_LENGTH} ký tự`),
    priceOrRate: z.number({ error: 'Vui lòng nhập giá' }).positive('Giá phải lớn hơn 0'),
    depositPrice: z.number().min(0, 'Tiền cọc không âm').optional(),
  })
  .refine((values) => values.listingType === 'sell' || values.depositPrice !== undefined, {
    message: 'Vui lòng nhập tiền cọc',
    path: ['depositPrice'],
  })

export type ListingFormValues = z.infer<typeof listingSchema>

export const EMPTY_LISTING_VALUES: Partial<ListingFormValues> = {
  listingType: 'rent',
  title: '',
  categoryId: '',
  condition: '',
  description: '',
}
