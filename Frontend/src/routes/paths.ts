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
