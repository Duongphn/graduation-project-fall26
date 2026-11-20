import { z } from 'zod'

import { CONTACT_DETAILS_MESSAGES, hasBlockedContactDetails } from '../toy-listings/contact-details'
import {
  DESCRIPTION_MAX_LENGTH,
  DESCRIPTION_MIN_LENGTH,
  MAX_IMAGES,
  TITLE_MAX_LENGTH,
} from '../toy-listings/toy-listing-schema'
import type { PublicOrganization } from '../organizations/types'
import { handoverMethods, type HandoverMethod } from './constants'

// Donor creates a donation post (POST /donation-posts, listingType "donate"): the toy, its photos, a
// safety check that blocks unsafe toys, the preferred receiver and the handover method.

/** Ảnh 3 góc: toàn cảnh, cận cảnh tem/thông số, khớp nối/vệ sinh */
export const MIN_DONATION_PHOTOS = 3
/** Mô tả theo luật của Toy Form (R03 III.5.2.1 (1) → III.3.1.1 (9): 50–1000 ký tự) */
export const DONATION_DESCRIPTION_MIN = DESCRIPTION_MIN_LENGTH
export const DONATION_DESCRIPTION_MAX = DESCRIPTION_MAX_LENGTH

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

/**
 * GB-51: cách bàn giao mà điểm nhận của tổ chức chấp nhận (SELF = mang đến, CARRIER = bưu kiện).
 * Chưa chọn tổ chức (tin để mở) thì cả hai.
 */
export const allowedHandoverMethods = (
  organization: Pick<PublicOrganization, 'receivingPoint'> | undefined,
): HandoverMethod[] => {
  const point = organization?.receivingPoint
  if (!organization || !point) return [...handoverMethods]
  return handoverMethods.filter((method) => (method === 'SELF' ? point.acceptsDropOff : point.acceptsParcel))
}

export const donationPostSchema = z
  .object({
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
      .min(DONATION_DESCRIPTION_MIN, `Mô tả tối thiểu ${DONATION_DESCRIPTION_MIN} ký tự`)
      .max(DONATION_DESCRIPTION_MAX, `Mô tả tối đa ${DONATION_DESCRIPTION_MAX} ký tự`)
      .refine((value) => !hasBlockedContactDetails(value), CONTACT_DETAILS_MESSAGES.description),
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
