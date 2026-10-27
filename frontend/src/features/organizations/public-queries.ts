import { queryOptions } from '@tanstack/react-query'
import { publicOrganizationsApi } from './public-api'
import type { PublicOrganizationListParams } from './types'

/** Dùng chung cho loader (tải trước) và useQuery trong trang (đọc cache) */


/** Chia hết cho 1, 2, 3 cột nên hàng cuối của lưới luôn đầy */
export const ORGANIZATION_PAGE_SIZE = 12

export interface OrganizationFilters {
  q?: string
  page: number
}

/** ?q=&page= → bộ lọc; giá trị lạ trên URL bị bỏ qua thay vì gửi lên backend (400) */
export function parseOrganizationSearch(searchParams: URLSearchParams): OrganizationFilters {
  const q = searchParams.get('q')?.trim()
  const page = Number(searchParams.get('page'))
  return {
    q: q || undefined,
    page: Number.isInteger(page) && page > 0 ? page : 1,
  }
}

/** Bộ lọc → URLSearchParams (bỏ giá trị rỗng và trang 1 để URL gọn) */
export function toOrganizationSearch(filters: OrganizationFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.q) params.set('q', filters.q)
  if (filters.page > 1) params.set('page', String(filters.page))
  return params
}

export const organizationListQuery = (filters: OrganizationFilters) => {
  const params: PublicOrganizationListParams = {
    ...(filters.q ? { q: filters.q } : {}),
    page: filters.page,
    limit: ORGANIZATION_PAGE_SIZE,
    sortBy: 'name',
    sortOrder: 'asc',
  }
  return queryOptions({
    queryKey: ['public-organizations', 'list', params],
    queryFn: () => publicOrganizationsApi.list(params),
    staleTime: 60_000,
    retry: false,
  })
}

export const organizationDetailQuery = (id: string) =>
  queryOptions({
    queryKey: ['public-organizations', 'detail', id],
    queryFn: () => publicOrganizationsApi.get(id),
    staleTime: 60_000,
    retry: false,
  })
