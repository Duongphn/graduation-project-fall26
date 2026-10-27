import { httpClient, type ApiResponse } from '../../services/http-client'
import type { ToyListing } from '../toy-listings/toy-listing-api'

/** Tin tặng vừa tạo: như ToyListing nhưng listingType là 'donate' */
export type DonationPost = Omit<ToyListing, 'listingType'> & { listingType: 'donate' }

export interface DonationPostInput {
  title: string
  categoryId: string
  condition: string
  description: string
  minAge: number
  maxAge: number
  images: File[]
}

/** POST /donation-posts: tin tặng miễn phí (listingType "donate"), chờ Admin duyệt như tin thường */
export async function createDonationPost(input: DonationPostInput): Promise<DonationPost> {
  const form = new FormData()
  form.append('title', input.title)
  form.append('categoryId', input.categoryId)
  form.append('condition', input.condition)
  form.append('description', input.description)
  form.append('ageRange', JSON.stringify({ minAge: input.minAge, maxAge: input.maxAge }))
  input.images.forEach((file) => form.append('images', file))

  const { data } = await httpClient.post<ApiResponse<DonationPost>>('/donation-posts', form, {
    timeout: 60_000,
  })
  return data.data
}
