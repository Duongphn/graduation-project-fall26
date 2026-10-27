import type { IdentityStatus, UserStatus, VerificationStatus } from '../../constants/domain'
import type { PaginationParams } from '../../types/api'

// Shapes of the Admin identity review API (server: features/identity_verifications/admin).

export interface IdentityQueueUser {
  id: string
  fullName: string
  // Masked by the backend (GB-35).
  maskedPhone: string
  maskedEmail: string
}

export interface IdentityVerificationSummary {
  id: string
  status: VerificationStatus
  submittedAt: string
  reviewedAt: string | null
  rejectionReason: string | null
}

export interface IdentityQueueItem extends IdentityVerificationSummary {
  user: IdentityQueueUser | null
  previousAttempts: number
}

export type IdentityCounts = Record<VerificationStatus, number>

export interface IdentityQueueParams extends PaginationParams {
  status: VerificationStatus
  q?: string
  sortBy?: 'submittedAt' | 'reviewedAt'
}

export type IdentityDocumentKey = 'frontImage' | 'backImage' | 'selfie'

// Authorized link (expiresAt); the backend sends null once the request is decided.
export interface IdentityDocumentLink {
  url: string
  expiresAt: string
}

export interface IdentityVerificationDetail extends IdentityVerificationSummary {
  reviewedBy: string | null
  phone: string
  idCardNumber: string
  user:
    // Contacts stay masked (maskedPhone, maskedEmail): the full email is not sent.
    | (IdentityQueueUser & {
        verificationStatus: IdentityStatus
        accountStatus: UserStatus
        locked: boolean
        joinedAt: string
      })
    | null
  documents: Record<IdentityDocumentKey, IdentityDocumentLink | null>
  previewAvailable: boolean
  previewExpiresAt: string | null
  previousRequests: IdentityVerificationSummary[]
}

export interface IdentityReviewResult {
  id: string
  status: VerificationStatus
  reviewedAt: string
  rejectionReason: string | null
  user: { id: string; verificationStatus: IdentityStatus }
}
