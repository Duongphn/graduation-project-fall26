import { httpClient, type ApiResponse } from '../../services/http-client'
import type { ToyListing } from '../toy-listings/toy-listing-api'
import type { DonationHandoverMethod } from './types'

/** Tin tặng vừa tạo: như ToyListing nhưng listingType là 'donate' */
export type DonationPost = Omit<ToyListing, 'listingType'> & {
  listingType: 'donate'
  // Tổ chức đã chọn (null: tin mở cho mọi người xin)
  donationTarget?: { organizationId: string; handoverMethod: DonationHandoverMethod } | null
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
  }

  const { data } = await httpClient.post<ApiResponse<DonationPost>>('/donation-posts', form, {
    timeout: 60_000,
  })
  return data.data
}
