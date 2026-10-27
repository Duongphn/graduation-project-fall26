import { httpClient } from '../../services/http-client'
import type { ListingType, ToyImage } from '../toy-listings/toy-listing-api'

/** GET /toys, /toys/:id, /toys/:id/availability: JSON thô, không bọc envelope (xem server toy-catalog.controller) */

export type CatalogSort = 'relevance' | 'newest' | 'price_asc' | 'price_desc' | 'distance'

/** Bộ lọc tìm kiếm, khớp tham số query của GET /toys */
export interface CatalogFilters {
  q?: string
  type?: ListingType
  categoryId?: string
  ageMin?: number
  ageMax?: number
  minPrice?: number
  maxPrice?: number
  lat?: number
  lng?: number
  radiusKm?: number
  sort?: CatalogSort
  page: number
  /** Số món mỗi trang; bỏ trống thì dùng CATALOG_PAGE_SIZE */
  limit?: number
}

interface CategoryRef {
  id: string
  name: string
  slug: string
}

export interface ToyCard {
  id: string
  title: string
  primaryImage: ToyImage | null
  listingType: ListingType
  priceOrRate: number
  depositPrice: number | null
  category: CategoryRef
  ageRange: { minAge: number; maxAge: number }
  condition: string
  /** GeoJSON Point: coordinates là [kinh độ, vĩ độ] */
  location?: { type: string; coordinates: [number, number] } | null
  createdAt: string
}

export interface ToyDetail extends Omit<ToyCard, 'primaryImage' | 'listingType'> {
  /** 'donate': tin quyên góp (priceOrRate 0), người khác gửi yêu cầu nhận đồ */
  listingType: ListingType | 'donate'
  description: string
  images: ToyImage[]
  owner: { id: string; displayName: string }
  updatedAt: string
}

export type SuggestionFilter = 'keyword' | 'category' | 'type' | 'ageRange' | 'priceRange' | 'area'

/** Gợi ý nới bộ lọc, backend chỉ trả về khi không có kết quả */
export interface SearchSuggestion {
  filter: SuggestionFilter
  action: 'remove' | 'widen' | 'increaseRadius'
  message: string
}

export interface ToySearchResult {
  items: ToyCard[]
  total: number
  page: number
  limit: number
  suggestions: SearchSuggestion[]
}

/** Khoảng ngày đã có đơn thuê (YYYY-MM-DD, tính cả hai đầu) */
export interface OccupiedPeriod {
  startDate: string
  endDate: string
}

export async function searchToys(filters: CatalogFilters): Promise<ToySearchResult> {
  const { data } = await httpClient.get<ToySearchResult>('/toys', { params: filters })
  return data
}

export async function fetchToyDetail(toyId: string): Promise<ToyDetail> {
  const { data } = await httpClient.get<ToyDetail>(`/toys/${toyId}`)
  return data
}

export async function fetchToyAvailability(toyId: string, from: string, to: string): Promise<OccupiedPeriod[]> {
  const { data } = await httpClient.get<{ periods: OccupiedPeriod[] }>(`/toys/${toyId}/availability`, {
    params: { from, to },
  })
  return data.periods
}
