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
  toys: '/toys',
  toyDetail: '/toys/:toyId',
} as const

export const toyListingEditPath = (toyId: string) => PATHS.editListing.replace(':toyId', toyId)

export const toyDetailPath = (toyId: string) => PATHS.toyDetail.replace(':toyId', toyId)
