import { apiGetPage, apiSendWithMessage } from '../../services/http'
import { MAX_PAGE_LIMIT } from '../../types/api'
import type {
  AdminCategory,
  CategoryCreateInput,
  CategoryListParams,
  CategoryOption,
  CategoryUpdateInput,
} from './types'

const ADMIN_URL = '/admin/categories'

// Mutations keep the backend message for the success toast (apiSendWithMessage).
export const categoriesApi = {
  listAdmin: (params: CategoryListParams) => apiGetPage<AdminCategory>(ADMIN_URL, params),

  // Every category, hidden ones included: options of Admin filters (e.g. toy moderation).
  adminOptions: async (): Promise<CategoryOption[]> =>
    (await apiGetPage<AdminCategory>(ADMIN_URL, { page: 1, limit: MAX_PAGE_LIMIT })).items,

  create: (input: CategoryCreateInput) =>
    apiSendWithMessage<AdminCategory>('post', ADMIN_URL, input),

  update: ({ id, input }: { id: string; input: CategoryUpdateInput }) =>
    apiSendWithMessage<AdminCategory>('patch', `${ADMIN_URL}/${id}`, input),

  hide: (id: string) => apiSendWithMessage<AdminCategory>('post', `${ADMIN_URL}/${id}/hide`),

  show: (id: string) => apiSendWithMessage<AdminCategory>('post', `${ADMIN_URL}/${id}/show`),

  remove: (id: string) => apiSendWithMessage<null>('delete', `${ADMIN_URL}/${id}`),

  // displayOrder = 1, 2, 3... in the order of ids.
  reorder: (ids: string[]) => apiSendWithMessage<null>('patch', `${ADMIN_URL}/reorder`, { ids }),
}
