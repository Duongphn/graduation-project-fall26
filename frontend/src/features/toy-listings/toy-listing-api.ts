import { isAxiosError } from 'axios'
import { getApiErrorCode, getApiErrorMessage, httpClient } from '../../services/http-client'
import { CONTACT_DETAILS_MESSAGES, type ContactField } from './contact-details'
import { SAFETY_REQUIRED_MESSAGE, tooFewPhotosMessage, type ListingFormValues } from './toy-listing-schema'

/** Các endpoint /toys và /categories trả JSON thô (chưa bọc envelope `{ success, data }`) */

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
  /**
   * Tên danh mục backend trả kèm, có cả khi Admin đã ẩn danh mục (không còn trong GET /categories);
   * chuỗi rỗng nếu danh mục không còn
   */
  categoryName?: string
  title: string
  description: string
  condition: string
  // donate: tin tặng miễn phí (tạo ở trang Tạo phiếu quyên góp, không sửa bằng form đăng tin)
  listingType: ListingType | 'donate'
  priceOrRate: number
  depositPrice?: number
  ageRange: { minAge: number; maxAge: number }
  images: ToyImage[]
  quantity: number
  status: ListingStatus
  /**
   * Kiểm duyệt: thời điểm gửi duyệt, lần duyệt gần nhất, và lý do Admin từ chối (chỉ có khi tin đang
   * bị từ chối: status 'hidden'). Sửa tin bị từ chối là gửi duyệt lại, lý do được xoá.
   */
  moderation?: { submittedAt?: string; reviewedAt?: string; rejectReason?: string }
  createdAt: string
  updatedAt: string
}

export interface Category {
  id: string
  name: string
  slug: string
  parentId: string | null
}

export interface MyListingsPage {
  items: ToyListing[]
  page: number
  limit: number
  total: number
}

export async function fetchCategories(): Promise<Category[]> {
  const { data } = await httpClient.get<Category[]>('/categories')
  return data
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
  // UC05: chỉ gửi sau khi schema đã kiểm tra đủ các cam kết an toàn được tick
  form.append('safetyDeclaration', 'true')
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

/** `error.details` của phản hồi lỗi từ backend (vd. { min, max } của TOO_FEW_PHOTOS) */
function errorDetails(error: unknown): Record<string, unknown> | undefined {
  if (!isAxiosError(error)) return undefined
  const details = (error.response?.data as { error?: { details?: unknown } } | undefined)?.error?.details
  return details && typeof details === 'object' ? (details as Record<string, unknown>) : undefined
}

/** Backend trả message tiếng Anh; dịch các mã lỗi người dùng có thể tự khắc phục */
const LISTING_ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại để tiếp tục.',
  USER_NOT_VERIFIED: 'Bạn cần xác thực danh tính (CCCD) trước khi đăng tin.',
  FORBIDDEN: 'Bạn không có quyền chỉnh sửa tin đăng này.',
  NOT_FOUND: 'Không tìm thấy tin đăng. Có thể tin đã bị xoá.',
  CATEGORY_NOT_FOUND: 'Danh mục đã chọn không còn hoạt động. Vui lòng chọn danh mục khác.',
  INVALID_IMAGE_FORMAT: 'Chỉ nhận ảnh JPG, PNG hoặc WebP, tối đa 5 MB mỗi ảnh. Vui lòng chọn ảnh khác.',
  TOO_MANY_PHOTOS: 'Tin đăng có tối đa 8 ảnh. Vui lòng bớt ảnh.',
  LISTING_TYPE_LOCKED: 'Tin đã được duyệt nên không đổi được loại tin (cho thuê / bán).',
  ORDER_IN_PROGRESS: 'Tin đang có đơn thuê hoặc mua chưa hoàn tất, chưa thể sửa, ẩn hoặc xoá.',
  LISTING_CHANGED: 'Tin đăng vừa được thay đổi ở nơi khác. Vui lòng tải lại trang rồi thử lại.',
  CLOUDINARY_NOT_CONFIGURED:'Máy chủ lưu ảnh chưa sẵn sàng. Vui lòng thử lại sau.',
  SAFETY_DECLARATION_REQUIRED: SAFETY_REQUIRED_MESSAGE,
}

/**
 * Ô bị backend từ chối vì có số điện thoại, email hoặc đường link (CONTACT_DETAILS_NOT_ALLOWED,
 * GB-11): 'title' hoặc 'description', để form hiện lỗi ngay dưới ô đó
 */
export function getContactDetailsField(error: unknown): ContactField | undefined {
  if (getApiErrorCode(error) !== 'CONTACT_DETAILS_NOT_ALLOWED') return undefined
  const field = errorDetails(error)?.field
  return field === 'title' || field === 'description' ? field : 'description'
}

export function getListingErrorMessage(error: unknown): string {
  const code = getApiErrorCode(error)
  const contactField = getContactDetailsField(error)
  if (contactField) return CONTACT_DETAILS_MESSAGES[contactField]
  // MSG21: số ảnh tối thiểu nằm trong error.details.min
  if (code === 'TOO_FEW_PHOTOS') {
    const min = errorDetails(error)?.min
    return typeof min === 'number' ? tooFewPhotosMessage(min) : 'Tin đăng chưa đủ số ảnh tối thiểu.'
  }
  return (code && LISTING_ERROR_MESSAGES[code]) || getApiErrorMessage(error)
}

export function isUnauthorizedError(error: unknown): boolean {
  return getApiErrorCode(error) === 'UNAUTHORIZED'
}
