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
  toys: '/toys',
  toyDetail: '/toys/:toyId',
  charityOrganizations: '/organizations',
  charityOrganization: '/organizations/:organizationId',
  myDonations: '/donations',
  newDonation: '/donations/new',
  donationHistory: '/profile/donations',
  myDonation: '/donations/:requestId',
  // Các trang dưới đây chưa được xây — link trỏ sẵn đúng địa chỉ, tạm thời route `*` đưa về trang chủ
  browseToys: '/toys',
  donations: '/donations',
  favorites: '/favorites',
  aiAdvisor: '/ai-advisor',
  help: '/help',
} as const

export const toyListingEditPath = (toyId: string) => PATHS.editListing.replace(':toyId', toyId)

export const charityOrganizationPath = (organizationId: string) =>
  PATHS.charityOrganization.replace(':organizationId', organizationId)

export const myDonationPath = (requestId: string) => PATHS.myDonation.replace(':requestId', requestId)

// Paths of the admin pages: admin-routes, admin-menu and every feature link use these, so a path
// is written once.
export const ADMIN_ROOT = '/admin'

export const adminPaths = {
  dashboard: ADMIN_ROOT,
  toys: `${ADMIN_ROOT}/toys`,
  toy: (id: string) => `${ADMIN_ROOT}/toys/${id}`,
  identityVerifications: `${ADMIN_ROOT}/identity-verifications`,
  identityVerification: (id: string) => `${ADMIN_ROOT}/identity-verifications/${id}`,
  categories: `${ADMIN_ROOT}/categories`,
  organizations: `${ADMIN_ROOT}/organizations`,
  donationRequests: `${ADMIN_ROOT}/donation-requests`,
  donationRequest: (id: string) => `${ADMIN_ROOT}/donation-requests/${id}`,
} as const

// Relative child path of /admin for the route table, e.g. 'toys' or 'toys/:id'.
export const adminChildPath = (path: string, suffix = '') =>
  `${path.slice(ADMIN_ROOT.length + 1)}${suffix}`

// First breadcrumb item of every admin page.
export const adminHomeCrumb = { title: 'Quản trị', to: ADMIN_ROOT }
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
