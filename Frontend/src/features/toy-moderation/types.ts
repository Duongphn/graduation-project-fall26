import type {
  AgeGroup,
  IdentityStatus,
  ListingType,
  ToyCondition,
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
  identityStatus: IdentityStatus
}

export interface ToyPricing {
  rentPerDay: number | null
  deposit: number | null
  salePrice: number | null
}

export interface ToyModerationListItem {
  id: string
  title: string
  listingType: ListingType
  status: ToyStatus
  condition: ToyCondition
  ageGroup: AgeGroup
  pricing: ToyPricing
  area: string | null
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
  age: number | null
  trustScore: number | null
  ratingCount: number
  memberSince: string
}

export interface ToyModerationDetail extends Omit<ToyModerationListItem, 'owner' | 'moderation'> {
  description: string
  images: string[]
  minPhotos: number
  minAgeYears: number
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
  status: 'ACTIVE' | 'REJECTED'
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
