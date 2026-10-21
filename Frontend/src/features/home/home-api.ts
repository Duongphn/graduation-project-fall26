import { httpClient } from '../../services/http-client'
import type { Category, ListingType, ToyListing } from '../toy-listings/toy-listing-api'

/**
 * Dữ liệu công khai cho trang chủ. Các endpoint trả JSON thô như /toys/mine (chưa bọc envelope).
 * Trường nào backend chưa có thì để optional — giao diện tự ẩn phần đó thay vì hiển thị dữ liệu giả.
 */

/** Tin công khai: không có ownerId, location, status; ảnh chỉ có url (không lộ publicId Cloudinary) */
export type PublicToy = Pick<
  ToyListing,
  'id' | 'categoryId' | 'title' | 'condition' | 'listingType' | 'priceOrRate' | 'depositPrice' | 'ageRange' | 'createdAt'
> & {
  images: { url: string }[]
  /**
   * Khu vực gần đúng để hiển thị (vd. "Quận 3, TP.HCM") — KHÔNG phải địa chỉ/toạ độ chính xác.
   * Backend chưa có trường này (model toys mới có toạ độ): chưa có thì thẻ tự ẩn dòng khu vực.
   */
  district?: string
}

export interface PublicToysPage {
  items: PublicToy[]
  page: number
  limit: number
  total: number
}

export type PublicToySort = 'popular' | 'newest'

export interface PublicToysParams {
  listingType: ListingType
  sort: PublicToySort
  page: number
  limit: number
}

/** Danh mục kèm số tin đang hiển thị — `toyCount` có khi backend bổ sung */
export interface HomeCategory extends Category {
  toyCount?: number
}

/** GET /toys — danh sách tin đang hiển thị, không cần đăng nhập */
export async function fetchPublicToys(params: PublicToysParams): Promise<PublicToysPage> {
  const { data } = await httpClient.get<PublicToysPage>('/toys', { params })
  return data
}

export async function fetchHomeCategories(): Promise<HomeCategory[]> {
  const { data } = await httpClient.get<HomeCategory[]>('/categories')
  return data
}
