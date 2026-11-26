import type { VisibilityStatus } from '../../constants/domain'
import type { PaginationParams } from '../../types/api'

// Mirrors server/src/services/organization.mapper.ts (develop's organizations model plus the
// receiving point and needs profile of 17/11/2026, R04 3.8).

/** An accepted age group, like a toy's ageRange: years, [minAge, maxAge). */
export interface AgeGroup {
  minAge: number
  maxAge: number
}

// GB-62: the address and opening hours are public, the contact is Admin-only.
export interface PublicReceivingPoint {
  province: string
  ward: string
  street: string
  openingHours: string
  acceptsDropOff: boolean
  acceptsParcel: boolean
}

export interface ReceivingPoint extends PublicReceivingPoint {
  contactName: string
  // E.164 (+84...).
  contactPhone: string
}

interface NeedsProfile {
  ageGroups: AgeGroup[]
  categoryIds: string[]
  // Area served; the receiving point's province when not set.
  areaProvince: string | null
  isRemoteArea: boolean
  // GB-55: false = no new donation requests.
  isAccepting: boolean
}

export interface Organization extends NeedsProfile {
  id: string
  name: string
  address: string
  contactInfo: string
  supportCriteria: string | null
  // null for an organization saved before receiving points existed.
  receivingPoint: ReceivingPoint | null
  status: VisibilityStatus
  // UC34: what the Admin checked and when; null for an organization saved before 18/11/2026.
  verificationNote: string | null
  verifiedAt: string | null
  openRequestCount: number
  requestCount: number
  createdAt: string
  updatedAt: string
}

export interface OrganizationListParams extends PaginationParams {
  status?: VisibilityStatus
  q?: string
}

// GET /organizations, GET /organizations/:id, GET /organizations/suggestions: what Donors see.
export interface PublicOrganization extends NeedsProfile {
  id: string
  name: string
  address: string
  // No longer returned (GB-62: contacts only on an accepted or shipping request). Kept optional
  // so the donor pages that still read it compile until they drop it.
  contactInfo?: string
  supportCriteria: string | null
  receivingPoint: PublicReceivingPoint | null
}

// GB-52 filters.
export interface PublicOrganizationListParams extends PaginationParams {
  q?: string
  province?: string
  minAge?: number
  maxAge?: number
  categoryId?: string
  remoteOnly?: boolean
}

// GB-54: the toy's age range and category; organizations in `province` come first.
export interface OrganizationSuggestionParams {
  categoryId: string
  minAge: number
  maxAge: number
  province?: string
}

export interface OrganizationInput {
  name: string
  address: string
  contactInfo: string
  verificationNote: string
  supportCriteria?: string
  receivingPoint: ReceivingPoint
  ageGroups: AgeGroup[]
  categoryIds: string[]
  areaProvince?: string
  isRemoteArea: boolean
  isAccepting: boolean
}
