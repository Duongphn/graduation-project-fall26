import { apiGet, apiGetPage } from '../../services/http'
import type {
  OrganizationSuggestionParams,
  PublicOrganization,
  PublicOrganizationListParams,
} from './types'

const BASE = '/organizations'

// Public charity organizations (Donor side).
export const publicOrganizationsApi = {
  list: (params: PublicOrganizationListParams) => apiGetPage<PublicOrganization>(BASE, params),

  get: (id: string) => apiGet<PublicOrganization>(`${BASE}/${id}`),

  // GB-54: organizations that accept a toy (rules only), the Donor's province first.
  suggestions: (params: OrganizationSuggestionParams) =>
    apiGet<PublicOrganization[]>(`${BASE}/suggestions`, params),
}
