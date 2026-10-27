import { apiGet, apiGetPage } from '../../services/http'
import type { PublicOrganization, PublicOrganizationListParams } from './types'

const BASE = '/organizations'

// Public charity organizations (Donor side).
export const publicOrganizationsApi = {
  list: (params: PublicOrganizationListParams) => apiGetPage<PublicOrganization>(BASE, params),

  get: (id: string) => apiGet<PublicOrganization>(`${BASE}/${id}`),
}
