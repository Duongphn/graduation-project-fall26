// Pages of the web app a notification opens (notifications.link, R04 3.20). They mirror
// frontend/src/routes/paths.ts; the email turns them into full URLs with APP_PUBLIC_URL.
export const notificationLinks = {
  identityVerification: () => '/profile/verification',
  myListings: () => '/listings',
  editListing: (toyId: string) => `/listings/${toyId}/edit`,
  toyDetail: (toyId: string) => `/toys/${toyId}`,
  /** The Donor's own donation request. */
  myDonation: (requestId: string) => `/donations/${requestId}`,
  /** A request the user sent to receive a donated toy. */
  myDonationRequest: (requestId: string) => `/donation-requests/${requestId}`,
  adminDonationRequest: (requestId: string) => `/admin/donation-requests/${requestId}`,
  /** A booking seen by its Renter. */
  myRental: (orderId: string) => `/rentals/mine/${orderId}`,
  /** A booking request seen by the Owner. */
  rentalRequest: (orderId: string) => `/rentals/requests/${orderId}`,
} as const;

/** Only app paths are stored: a notification never sends the user to another site. */
export const isAppLink = (link: string | undefined): link is string =>
  typeof link === 'string' && /^\/(?!\/)[^\s]*$/.test(link);

export const absoluteUrl = (link: string | undefined, appPublicUrl: string): string =>
  `${appPublicUrl.replace(/\/+$/, '')}${isAppLink(link) ? link : '/'}`;
