export const PATHS = {
  home: '/',
  login: '/login',
  register: '/register',
  forgotPassword: '/forgot-password',
  terms: '/terms',
  privacy: '/privacy',
  profile: '/profile',
  identityVerification: '/profile/verification',
  myListings: '/listings',
  newListing: '/listings/new',
  editListing: '/listings/:toyId/edit',
  // Các trang dưới đây chưa được xây — link trỏ sẵn đúng địa chỉ, tạm thời route `*` đưa về trang chủ
  browseToys: '/toys',
  toyDetail: '/toys/:toyId',
  donations: '/donations',
  favorites: '/favorites',
  aiAdvisor: '/ai-advisor',
  help: '/help',
} as const

export const toyListingEditPath = (toyId: string) => PATHS.editListing.replace(':toyId', toyId)

export const toyDetailPath = (toyId: string) => PATHS.toyDetail.replace(':toyId', toyId)

export interface BrowseToysFilters {
  type?: 'rent' | 'sell'
  q?: string
  category?: string
  minAge?: number
  maxAge?: number
}

/** /toys?type=rent&minAge=3 … — bỏ qua tham số rỗng để URL gọn */
export function browseToysPath(filters: BrowseToysFilters = {}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') params.set(key, String(value))
  }
  const query = params.toString()
  return query ? `${PATHS.browseToys}?${query}` : PATHS.browseToys
}
