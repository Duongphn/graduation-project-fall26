import { z } from 'zod'

import { CONTACT_DETAILS_MESSAGES, hasBlockedContactDetails } from './contact-details'

export const TITLE_MAX_LENGTH = 100
export const DESCRIPTION_MIN_LENGTH = 50
export const DESCRIPTION_MAX_LENGTH = 1000

/** Giới hạn ảnh chung của các form tải ảnh khác (quyên góp, bàn giao, hồ sơ) */
export const MAX_IMAGES = 10
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/** Ảnh tin cho thuê / bán (R03 GB-10): thuê 3–8 ảnh, bán 4–8 ảnh; backend kiểm tra cùng giới hạn */
export const LISTING_PHOTO_LIMITS = {
  rent: { min: 3, max: 8 },
  sell: { min: 4, max: 8 },
} as const
export const LISTING_MAX_IMAGES = 8
/** Ảnh tin đăng nhận JPG, PNG hoặc WebP, tối đa 5 MB mỗi ảnh (R03 GB-10, MSG20) */
export const LISTING_IMAGE_TYPES = ACCEPTED_IMAGE_TYPES

/** MSG21 */
export const tooFewPhotosMessage = (min: number) => `Vui lòng tải lên ít nhất ${min} ảnh.`

/** Khoảng giá (R03 III.3.1.1 (11)–(12), III.3.1.2 (12)) */
export const PRICE_RULES = {
  rent: { min: 5_000, max: 5_000_000 },
  sell: { min: 10_000, max: 50_000_000 },
} as const

const formatVndNumber = (value: number) => value.toLocaleString('vi-VN')

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
      .max(TITLE_MAX_LENGTH, `Tên đồ chơi tối đa ${TITLE_MAX_LENGTH} ký tự`)
      .refine((value) => !hasBlockedContactDetails(value), CONTACT_DETAILS_MESSAGES.title),
    categoryId: z.string().min(1, 'Vui lòng chọn danh mục'),
    minAge: z.number({ error: 'Vui lòng chọn độ tuổi' }).int().min(0),
    maxAge: z.number({ error: 'Vui lòng chọn độ tuổi' }).int().min(0),
    condition: z.string().min(1, 'Vui lòng chọn tình trạng'),
    description: z
      .string()
      .trim()
      .min(DESCRIPTION_MIN_LENGTH, `Mô tả tối thiểu ${DESCRIPTION_MIN_LENGTH} ký tự`)
      .max(DESCRIPTION_MAX_LENGTH, `Mô tả tối đa ${DESCRIPTION_MAX_LENGTH} ký tự`)
      .refine((value) => !hasBlockedContactDetails(value), CONTACT_DETAILS_MESSAGES.description),
    priceOrRate: z.number({ error: 'Vui lòng nhập giá' }).int('Giá phải là số nguyên (VND)'),
    depositPrice: z.number().int('Tiền cọc phải là số nguyên (VND)').optional(),
  })
  .superRefine((values, ctx) => {
    const range = PRICE_RULES[values.listingType]
    if (values.priceOrRate < range.min || values.priceOrRate > range.max) {
      ctx.addIssue({
        code: 'custom',
        path: ['priceOrRate'],
        message: `Giá phải từ ${formatVndNumber(range.min)} đ đến ${formatVndNumber(range.max)} đ`,
      })
    }
    if (values.listingType !== 'rent') return
    if (values.depositPrice === undefined) {
      ctx.addIssue({ code: 'custom', path: ['depositPrice'], message: 'Vui lòng nhập tiền cọc' })
    } else if (values.depositPrice < values.priceOrRate) {
      ctx.addIssue({
        code: 'custom',
        path: ['depositPrice'],
        message: 'Tiền cọc tối thiểu bằng giá thuê một ngày',
      })
    }
  })

export type ListingFormValues = z.infer<typeof listingSchema>

export const EMPTY_LISTING_VALUES: Partial<ListingFormValues> = {
  listingType: 'rent',
  title: '',
  categoryId: '',
  condition: '',
  description: '',
}
