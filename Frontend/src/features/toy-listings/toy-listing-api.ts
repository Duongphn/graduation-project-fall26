import { getApiErrorCode, getApiErrorMessage, httpClient, type ApiResponse } from '../../services/http-client'
import type { ListingFormValues } from './toy-listing-schema'

/** Các endpoint /toys trả JSON thô (chưa bọc envelope `{ success, data }`) */

export type ListingType = 'rent' | 'sell'
export type ListingStatus = 'pending' | 'active' | 'hidden' | 'sold'

export interface ToyImage {
  url: string
  publicId: string
}

export interface ToyListing {
  id: string
  ownerId: string
  categoryId: string
  /** Tên danh mục nếu backend trả kèm (cần khi danh mục đã bị ẩn, không còn trong GET /categories) */
  categoryName?: string
  title: string
  description: string
  condition: string
  listingType: ListingType
  priceOrRate: number
  depositPrice?: number
  ageRange: { minAge: number; maxAge: number }
  images: ToyImage[]
  quantity: number
  status: ListingStatus
  createdAt: string
  updatedAt: string
}

export interface Category {
  id: string
  name: string
  slug: string
}

export interface MyListingsPage {
  items: ToyListing[]
  page: number
  limit: number
  total: number
}

export async function fetchCategories(): Promise<Category[]> {
  // GET /categories trả envelope { success, data } (server/docs/api-conventions.md)
  const { data } = await httpClient.get<ApiResponse<Category[]>>('/categories')
  return data.data
}

export async function fetchMyListings(params: { status?: ListingStatus; page: number; limit: number }): Promise<MyListingsPage> {
  const { data } = await httpClient.get<MyListingsPage>('/toys/mine', { params })
  return data
}

export async function hideToyListing(toyId: string): Promise<ToyListing> {
  const { data } = await httpClient.post<ToyListing>(`/toys/${toyId}/hide`)
  return data
}

export async function deleteToyListing(toyId: string): Promise<void> {
  await httpClient.delete(`/toys/${toyId}`)
}

const MINE_PAGE_LIMIT = 100

/** Backend chưa có GET /toys/:id nên tìm tin trong danh sách tin của chính chủ */
export async function fetchMyListing(toyId: string): Promise<ToyListing | null> {
  for (let page = 1; ; page++) {
    const { data } = await httpClient.get<MyListingsPage>('/toys/mine', {
      params: { page, limit: MINE_PAGE_LIMIT },
    })
    const found = data.items.find((item) => item.id === toyId)
    if (found) return found
    if (page * data.limit >= data.total) return null
  }
}

function appendListingFields(form: FormData, values: ListingFormValues, savedCategoryId?: string) {
  form.append('listingType', values.listingType)
  form.append('title', values.title)
  // Khi sửa: chỉ gửi categoryId nếu đã đổi, để tin thuộc danh mục đã bị Admin ẩn vẫn sửa được
  if (values.categoryId !== savedCategoryId) form.append('categoryId', values.categoryId)
  form.append('condition', values.condition)
  form.append('description', values.description)
  form.append('priceOrRate', String(values.priceOrRate))
  // Backend từ chối depositPrice với tin bán lại
  if (values.listingType === 'rent' && values.depositPrice !== undefined) {
    form.append('depositPrice', String(values.depositPrice))
  }
  form.append('ageRange', JSON.stringify({ minAge: values.minAge, maxAge: values.maxAge }))
}

export async function createToyListing(payload: { values: ListingFormValues; newImages: File[] }): Promise<ToyListing> {
  const form = new FormData()
  appendListingFields(form, payload.values)
  payload.newImages.forEach((file) => form.append('images', file))

  const { data } = await httpClient.post<ToyListing>('/toys', form, { timeout: 60_000 })
  return data
}

export async function updateToyListing(payload: {
  toyId: string
  values: ListingFormValues
  /** categoryId hiện tại của tin (trước khi sửa) */
  savedCategoryId: string
  newImages: File[]
  removeImagePublicIds: string[]
}): Promise<ToyListing> {
  const form = new FormData()
  appendListingFields(form, payload.values, payload.savedCategoryId)
  payload.newImages.forEach((file) => form.append('images', file))
  if (payload.removeImagePublicIds.length > 0) {
    form.append('removeImagePublicIds', JSON.stringify(payload.removeImagePublicIds))
  }

  const { data } = await httpClient.patch<ToyListing>(`/toys/${payload.toyId}`, form, { timeout: 60_000 })
  return data
}

/** Backend trả message tiếng Anh; dịch các mã lỗi người dùng có thể tự khắc phục */
const LISTING_ERROR_MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để tiếp tục.',
  USER_NOT_VERIFIED: 'Bạn cần xác thực danh tính (CCCD) trước khi đăng tin.',
  FORBIDDEN: 'Bạn không có quyền chỉnh sửa tin đăng này.',
  NOT_FOUND: 'Không tìm thấy tin đăng. Có thể tin đã bị xoá.',
  CATEGORY_NOT_FOUND: 'Danh mục đã chọn không còn hoạt động. Vui lòng chọn danh mục khác.',
  INVALID_IMAGE_FORMAT: 'Có ảnh không đúng định dạng JPG, PNG hoặc WebP. Vui lòng chọn ảnh khác.',
  ORDER_IN_PROGRESS: 'Tin đang có đơn thuê hoặc mua chưa hoàn tất, chưa thể sửa, ẩn hoặc xoá.',
  CLOUDINARY_NOT_CONFIGURED:'Máy chủ lưu ảnh chưa sẵn sàng. Vui lòng thử lại sau.',
}

export function getListingErrorMessage(error: unknown): string {
  const code = getApiErrorCode(error)
  return (code && LISTING_ERROR_MESSAGES[code]) || getApiErrorMessage(error)
}

export function isUnauthorizedError(error: unknown): boolean {
  return getApiErrorCode(error) === 'UNAUTHENTICATED'
}
