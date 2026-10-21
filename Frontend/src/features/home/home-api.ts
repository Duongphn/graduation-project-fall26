import { httpClient } from '../../services/http-client'
import type { Category, ListingType, ToyListing } from '../toy-listings/toy-listing-api'
import type { ApiResponse } from '../../types/api'
import { searchToys } from '../toy-catalog/toy-catalog-api'

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

/**
 * GET /toys (tìm kiếm của toy catalog) — danh sách tin đang hiển thị, không cần đăng nhập.
 * API tìm kiếm chưa có kiểu sắp xếp "phổ biến" (theo số đơn thuê): tạm lấy tin mới nhất.
 */
export async function fetchPublicToys({ listingType, page, limit }: PublicToysParams): Promise<PublicToysPage> {
  const result = await searchToys({ type: listingType, sort: 'newest', page, limit })
  return {
    items: result.items.map((toy) => ({
      id: toy.id,
      categoryId: toy.category.id,
      title: toy.title,
      condition: toy.condition,
      listingType: toy.listingType,
      priceOrRate: toy.priceOrRate,
      ...(toy.depositPrice !== null ? { depositPrice: toy.depositPrice } : {}),
      ageRange: toy.ageRange,
      createdAt: toy.createdAt,
      images: toy.primaryImage ? [{ url: toy.primaryImage.url }] : [],
    })),
    page: result.page,
    limit: result.limit,
    total: result.total,
  }
}

export async function fetchHomeCategories(): Promise<HomeCategory[]> {
  // GET /categories trả envelope { success, data } (server/docs/api-conventions.md)
  const { data } = await httpClient.get<ApiResponse<HomeCategory[]>>('/categories')
  return data.data
}
