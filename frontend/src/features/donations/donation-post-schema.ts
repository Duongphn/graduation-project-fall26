import { z } from 'zod'

import { MAX_IMAGES, TITLE_MAX_LENGTH } from '../toy-listings/toy-listing-schema'
import { handoverMethodLabels, handoverMethods, type HandoverMethod } from './constants'

// Donor creates a donation post (POST /toys, listingType "donate"): the toy, its photos, a
// safety check that blocks unsafe toys, the preferred receiver and the handover method.

/** Ảnh 3 góc: toàn cảnh, cận cảnh tem/thông số, khớp nối/vệ sinh */
export const MIN_DONATION_PHOTOS = 3
export const DONATION_DESCRIPTION_MIN = 20
export const DONATION_DESCRIPTION_MAX = 800

/** Người tặng phải cam kết đủ 4 điều trước khi gửi phiếu */
export const SAFETY_COMMITMENTS = [
  {
    key: 'noSharpParts',
    title: 'Không có cạnh nứt vỡ, mảnh nhọn hay kim loại gây trầy xước',
    hint: 'Đã kiểm tra các góc bo tròn, thanh và vỏ nhựa nguyên vẹn.',
  },
  {
    key: 'batteriesRemoved',
    title: 'Đã tháo bỏ hoặc kiểm tra pin không bị chảy hoá chất',
    hint: 'Khoang pin sạch, nắp đậy pin có ốc vít cố định an toàn.',
  },
  {
    key: 'noSmallParts',
    title: 'Không có chi tiết nhỏ dễ tháo rời gây nguy cơ hóc dị vật cho trẻ nhỏ',
    hint: 'Các mảnh ghép phù hợp với độ tuổi đã chọn.',
  },
  {
    key: 'cleaned',
    title: 'Đã được vệ sinh, sát khuẩn sạch sẽ, không ẩm mốc hay dính dầu mỡ',
    hint: 'Đồ chơi vải đã giặt, đồ chơi nhựa đã lau khử khuẩn.',
  },
] as const

export type SafetyKey = (typeof SAFETY_COMMITMENTS)[number]['key']

/**
 * Đồ chơi bị từ chối ngay (danh mục cấm): tên hoặc mô tả chứa các từ này thì không gửi được.
 * So khớp không dấu, không phân biệt hoa thường.
 */
export const BANNED_TOY_TERMS = [
  { term: 'sung ban dan', label: 'súng bắn đạn' },
  { term: 'sung hoi', label: 'súng hơi' },
  { term: 'phao hoa', label: 'pháo hoa' },
  { term: 'phao no', label: 'pháo nổ' },
  { term: 'slime', label: 'slime' },
  { term: 'nam cham nho', label: 'nam châm nhỏ' },
  { term: 'pin cuc ao', label: 'pin cúc áo' },
  { term: 'hoa chat', label: 'hoá chất' },
] as const

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()

/** Các từ cấm xuất hiện trong tên/mô tả (khớp nguyên từ, không dấu) */
export const findBannedTerms = (...texts: string[]): string[] => {
  const haystack = ` ${normalize(texts.join(' ')).replace(/[^a-z0-9]+/g, ' ')} `
  return BANNED_TOY_TERMS.filter(({ term }) => haystack.includes(` ${term} `)).map(({ label }) => label)
}

/** Giá trị đặc biệt: để ToyFlow chọn tổ chức phù hợp */
export const AUTO_MATCH = 'AUTO'

export const donationPostSchema = z
  .object({
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
      .min(DONATION_DESCRIPTION_MIN, `Mô tả tối thiểu ${DONATION_DESCRIPTION_MIN} ký tự`)
      .max(DONATION_DESCRIPTION_MAX, `Mô tả tối đa ${DONATION_DESCRIPTION_MAX} ký tự`),
    safety: z.object({
      noSharpParts: z.boolean(),
      batteriesRemoved: z.boolean(),
      noSmallParts: z.boolean(),
      cleaned: z.boolean(),
    }),
    // id tổ chức, hoặc AUTO_MATCH
    receiver: z.string(),
    handoverMethod: z.enum(handoverMethods),
  })
  .refine((values) => Object.values(values.safety).every(Boolean), {
    message: 'Cần xác nhận đủ 4 tiêu chí an toàn trước khi gửi phiếu.',
    path: ['safety'],
  })
  .refine((values) => findBannedTerms(values.title, values.description).length === 0, {
    message: 'Đồ chơi thuộc danh mục bị từ chối tiếp nhận, không thể tạo phiếu.',
    path: ['title'],
  })

export type DonationPostValues = z.infer<typeof donationPostSchema>

export const EMPTY_DONATION_POST: Partial<DonationPostValues> = {
  title: '',
  categoryId: '',
  condition: '',
  description: '',
  safety: { noSharpParts: false, batteriesRemoved: false, noSmallParts: false, cleaned: false },
  receiver: AUTO_MATCH,
  handoverMethod: 'CARRIER',
}

export const isPhotoCountValid = (count: number) => count >= MIN_DONATION_PHOTOS && count <= MAX_IMAGES

/**
 * Backend chưa có trường cho tổ chức mong muốn và cách bàn giao: ghi ở cuối mô tả để Admin
 * đọc khi ghép tổ chức (POST /admin/donation-requests).
 */
export const composeDonationDescription = (
  description: string,
  handoverMethod: HandoverMethod,
  receiverName: string | null,
) =>
  [
    description.trim(),
    '',
    `Cách bàn giao: ${handoverMethodLabels[handoverMethod]}`,
    `Đơn vị tiếp nhận mong muốn: ${receiverName ?? 'Để ToyFlow ghép tổ chức phù hợp'}`,
  ].join('\n')
