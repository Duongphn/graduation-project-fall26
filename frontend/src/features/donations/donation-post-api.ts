import { httpClient, type ApiResponse } from '../../services/http-client'
import type { ToyListing } from '../toy-listings/toy-listing-api'
import type { DonationHandoverMethod } from './types'

/** Tin tặng vừa tạo: như ToyListing nhưng listingType là 'donate' */
export type DonationPost = Omit<ToyListing, 'listingType'> & {
  listingType: 'donate'
  // Tổ chức đã chọn (null: tin mở cho mọi người xin)
  donationTarget?: { organizationId: string; handoverMethod: DonationHandoverMethod; note?: string } | null
}

export interface DonationPostInput {
  title: string
  categoryId: string
  condition: string
  description: string
  minAge: number
  maxAge: number
  images: File[]
  // UC33 bước 4: tổ chức nhận và cách bàn giao; không có thì tin mở cho mọi người xin (FE-02)
  organizationId?: string
  handoverMethod?: DonationHandoverMethod
  // R03 III.5.2.1 (8): ghi chú cho tổ chức đã chọn, tối đa 300 ký tự
  note?: string
}

/**
 * POST /donation-posts: tin tặng miễn phí (listingType "donate"), chờ Admin duyệt như tin thường.
 * Có tổ chức thì khi Admin duyệt tin, yêu cầu quyên góp tới tổ chức đó được tạo (UC33 bước 5).
 */
export async function createDonationPost(input: DonationPostInput): Promise<DonationPost> {
  const form = new FormData()
  form.append('title', input.title)
  form.append('categoryId', input.categoryId)
  form.append('condition', input.condition)
  form.append('description', input.description)
  form.append('ageRange', JSON.stringify({ minAge: input.minAge, maxAge: input.maxAge }))
  input.images.forEach((file) => form.append('images', file))
  if (input.organizationId && input.handoverMethod) {
    form.append('organizationId', input.organizationId)
    form.append('handoverMethod', input.handoverMethod)
    if (input.note) form.append('note', input.note)
  }

  const { data } = await httpClient.post<ApiResponse<DonationPost>>('/donation-posts', form, {
    timeout: 60_000,
  })
  return data.data
}

export interface DonationPostUpdate
  extends Omit<DonationPostInput, 'images' | 'organizationId' | 'handoverMethod' | 'note'> {
  /** categoryId hiện tại của tin: chỉ gửi categoryId khi đã đổi (như form đăng tin) */
  savedCategoryId: string
  newImages: File[]
  removeImagePublicIds: string[]
}

/**
 * PATCH /toys/:id cho tin tặng (không có giá): tin bị Admin từ chối được gửi duyệt lại (UC33 5.1,
 * BF-04 3a); tin bị ẩn vì Admin huỷ yêu cầu đang bàn giao cũng được duyệt lại (GB-60).
 */
export async function updateDonationPost(toyId: string, input: DonationPostUpdate): Promise<ToyListing> {
  const form = new FormData()
  form.append('title', input.title)
  if (input.categoryId !== input.savedCategoryId) form.append('categoryId', input.categoryId)
  form.append('condition', input.condition)
  form.append('description', input.description)
  form.append('ageRange', JSON.stringify({ minAge: input.minAge, maxAge: input.maxAge }))
  input.newImages.forEach((file) => form.append('images', file))
  if (input.removeImagePublicIds.length > 0) {
    form.append('removeImagePublicIds', JSON.stringify(input.removeImagePublicIds))
  }
  const { data } = await httpClient.patch<ToyListing>(`/toys/${toyId}`, form, { timeout: 60_000 })
  return data
}
