import { apiGet, apiGetPage, apiSendWithMessage } from '../../services/http'
import type {
  AdminCategory,
  CategoryCreateInput,
  CategoryListParams,
  CategoryOption,
  CategoryUpdateInput,
  PublicCategory,
} from './types'

const ADMIN_URL = '/admin/categories'
// The backend maximum page size: one page holds every category.
const ALL_CATEGORIES_LIMIT = 100

// Mutations keep the backend message for the success toast (apiSendWithMessage).
export const categoriesApi = {
  // Public: ACTIVE categories in menu order (post forms, search filters).
  listPublic: () => apiGet<PublicCategory[]>('/categories'),

  listAdmin: (params: CategoryListParams) => apiGetPage<AdminCategory>(ADMIN_URL, params),

  // Every category, hidden ones included: options of Admin filters (e.g. toy moderation).
  adminOptions: async (): Promise<CategoryOption[]> =>
    (await apiGetPage<AdminCategory>(ADMIN_URL, { page: 1, limit: ALL_CATEGORIES_LIMIT })).items,

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
