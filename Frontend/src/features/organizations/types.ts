import type { AgeGroup, VisibilityStatus } from '../../constants/domain'
import type { VietnamProvince } from '../../constants/provinces'
import type { PaginationParams } from '../../types/api'

// Mirrors OrganizationAdmin in server/src/features/organizations/organizations.schemas.ts.
export interface Organization {
  id: string
  name: string
  address: string
  province: VietnamProvince | null
  contactInfo: string
  supportCriteria: string
  description: string | null
  ageGroups: AgeGroup[]
  logoUrl: string | null
  phoneMasked: string
  // Full number: only from the detail endpoint and the create/update answers.
  phone?: string
  status: VisibilityStatus
  openRequestCount: number
  requestCount: number
  createdAt: string
  updatedAt: string
}

export interface OrganizationListParams extends PaginationParams {
  status?: VisibilityStatus
  province?: VietnamProvince
  q?: string
}

export interface OrganizationInput {
  name: string
  address: string
  province: VietnamProvince
  phone: string
  contactInfo: string
  supportCriteria: string
  ageGroups: AgeGroup[]
  description?: string | null
  logoUrl?: string | null
}
