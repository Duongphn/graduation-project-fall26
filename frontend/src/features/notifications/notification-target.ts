import { PATHS } from '../../routes/paths'
import type { AppNotification } from './notifications-api'

// The backend stores no link with a notification (only type, title and body), so the page to
// open is chosen from the type; for donations the body tells the Donor's messages apart.
const DONOR_DONATION_HINTS = ['Bạn nhận được một yêu cầu', 'tải ảnh bàn giao', 'bạn quyên góp']

export function notificationTargetPath({ type, body }: Pick<AppNotification, 'type' | 'body'>): string | null {
  switch (type) {
    case 'IDENTITY_REVIEWED':
      return PATHS.identityVerification
    case 'TOY_REVIEWED':
      return PATHS.myListings
    case 'DONATION_STATUS_CHANGED':
      return DONOR_DONATION_HINTS.some((hint) => body.includes(hint)) ? PATHS.myDonations : PATHS.myDonationRequests
    default:
      return null
  }
}
