import { httpClient } from '../../services/http-client'
import type { ToyListing } from '../toy-listings/toy-listing-api'

export interface DonationPostInput {
  title: string
  categoryId: string
  condition: string
  description: string
  minAge: number
  maxAge: number
  images: File[]
}

/** POST /toys với listingType "donate": tin tặng miễn phí, chờ Admin duyệt như tin thường */
export async function createDonationPost(input: DonationPostInput): Promise<ToyListing> {
  const form = new FormData()
  form.append('listingType', 'donate')
  form.append('title', input.title)
  form.append('categoryId', input.categoryId)
  form.append('condition', input.condition)
  form.append('description', input.description)
  form.append('ageRange', JSON.stringify({ minAge: input.minAge, maxAge: input.maxAge }))
  input.images.forEach((file) => form.append('images', file))

  const { data } = await httpClient.post<ToyListing>('/toys', form, { timeout: 60_000 })
  return data
}
