import { apiGet, apiGetPage, apiSendWithMessage } from '../../services/http'
import type { Organization, OrganizationInput, OrganizationListParams } from './types'

const BASE = '/admin/organizations'

// Mutations keep the backend message (e.g. "2 yêu cầu đang chạy vẫn tiếp tục") for the toast.
export const organizationsApi = {
  list: (params: OrganizationListParams) => apiGetPage<Organization>(BASE, params),

  get: (id: string) => apiGet<Organization>(`${BASE}/${id}`),

  create: (input: OrganizationInput) => apiSendWithMessage<Organization>('post', BASE, input),

  update: (id: string, input: Partial<OrganizationInput>) =>
    apiSendWithMessage<Organization>('patch', `${BASE}/${id}`, input),

  hide: (id: string) => apiSendWithMessage<Organization>('post', `${BASE}/${id}/hide`),

  show: (id: string) => apiSendWithMessage<Organization>('post', `${BASE}/${id}/show`),

  remove: (id: string) => apiSendWithMessage<null>('delete', `${BASE}/${id}`),
}
