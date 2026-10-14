export const PATHS = {
  home: '/',
  login: '/login',
  register: '/register',
  forgotPassword: '/forgot-password',
  terms: '/terms',
  privacy: '/privacy',
  myListings: '/listings',
  newListing: '/listings/new',
  editListing: '/listings/:toyId/edit',
} as const

export const toyListingEditPath = (toyId: string) => PATHS.editListing.replace(':toyId', toyId)

// Paths of the admin pages: admin-routes, admin-menu and every feature link use these, so a path
// is written once.
export const ADMIN_ROOT = '/admin'

export const adminPaths = {
  dashboard: ADMIN_ROOT,
  categories: `${ADMIN_ROOT}/categories`,
  organizations: `${ADMIN_ROOT}/organizations`,
} as const

// Relative child path of /admin for the route table, e.g. 'toys' or 'toys/:id'.
export const adminChildPath = (path: string, suffix = '') =>
  `${path.slice(ADMIN_ROOT.length + 1)}${suffix}`

// First breadcrumb item of every admin page.
export const adminHomeCrumb = { title: 'Quản trị', to: ADMIN_ROOT }
