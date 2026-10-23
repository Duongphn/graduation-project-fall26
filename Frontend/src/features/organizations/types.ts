import type { VisibilityStatus } from '../../constants/domain'
import type { PaginationParams } from '../../types/api'

// Mirrors the admin DTO of server/src/features/organizations/organizations.mapper.ts
// (develop's organizations model: name, address, contact_info, support_criteria, status).
export interface Organization {
  id: string
  name: string
  address: string
  contactInfo: string
  supportCriteria: string
  status: VisibilityStatus
  openRequestCount: number
  requestCount: number
  createdAt: string
  updatedAt: string
}

export interface OrganizationListParams extends PaginationParams {
  status?: VisibilityStatus
  q?: string
}

// GET /organizations, GET /organizations/:id: what Donors see.
export interface PublicOrganization {
  id: string
  name: string
  address: string
  contactInfo: string
  supportCriteria: string
}

export interface PublicOrganizationListParams extends PaginationParams {
  q?: string
}

export interface OrganizationInput {
  name: string
  address: string
  contactInfo: string
  supportCriteria: string
}
