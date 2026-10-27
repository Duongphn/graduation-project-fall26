import type {
  IdentityStatus,
  ListingType,
  ToyStatus,
  UserStatus,
  VisibilityStatus,
} from '../../constants/domain'
import type { PaginationParams } from '../../types/api'

// Responses of /admin/toys (server/src/features/toys/toy-moderation.schemas.ts).

export interface ModerationCategory {
  id: string
  name: string
  status: VisibilityStatus
}

export interface ModerationOwner {
  id: string
  fullName: string
  maskedPhone: string
  verificationStatus: IdentityStatus
}

// Price fields of develop's toys model.
export interface ToyPricing {
  priceOrRate: number
  depositPrice: number | null
}

export interface ToyAgeRange {
  minAge: number
  maxAge: number
}

export interface ToyModerationListItem {
  id: string
  title: string
  listingType: ListingType
  status: ToyStatus
  condition: string
  ageRange: ToyAgeRange
  priceOrRate: number
  depositPrice: number | null
  coverImage: string | null
  imageCount: number
  category: ModerationCategory | null
  owner: ModerationOwner | null
  moderation: { submittedAt: string; rejectReason: string | null }
  createdAt: string
  // Sent back with every decision: the stale-edit token.
  updatedAt: string
}

export interface ModerationWarning {
  code: string
  message: string
}

export interface ModerationOwnerDetail extends ModerationOwner {
  accountStatus: UserStatus
  lockedUntil: string | null
  trustScore: number | null
  memberSince: string
}

export interface ToyModerationDetail extends Omit<ToyModerationListItem, 'owner' | 'moderation'> {
  description: string
  images: Array<{ url: string; publicId: string }>
  minPhotos: number
  owner: ModerationOwnerDetail | null
  moderation: {
    submittedAt: string
    rejectReason: string | null
    reviewedBy: { id: string; fullName: string | null } | null
    reviewedAt: string | null
  }
  warnings: ModerationWarning[]
}

export type ToyStatusCounts = Record<ToyStatus, number>

export interface ToyModerationDecision {
  id: string
  // 'hidden' = rejected (moderation.rejectReason is set).
  status: 'active' | 'hidden'
  updatedAt: string
  moderation: { reviewedBy: string; reviewedAt: string; rejectReason: string | null }
}

export interface ToyModerationFilters {
  listingType?: ListingType
  categoryId?: string
  q?: string
}

export interface ToyModerationQueueParams extends PaginationParams, ToyModerationFilters {
  status: ToyStatus
}
