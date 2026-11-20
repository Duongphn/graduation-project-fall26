import { queryOptions } from '@tanstack/react-query'
import { organizationAgeGroups, type AgeGroupKey } from './constants'
import { publicOrganizationsApi } from './public-api'
import type { PublicOrganizationListParams } from './types'

/** Dùng chung cho loader (tải trước) và useQuery trong trang (đọc cache) */


/** Chia hết cho 1, 2, 3 cột nên hàng cuối của lưới luôn đầy */
export const ORGANIZATION_PAGE_SIZE = 12

export interface OrganizationFilters {
  q?: string
  // GB-52: tỉnh của điểm nhận, nhóm tuổi, danh mục, chỉ vùng khó khăn
  province?: string
  age?: AgeGroupKey
  categoryId?: string
  remoteOnly?: boolean
  page: number
}

const isAgeGroupKey = (value: string | null): value is AgeGroupKey =>
  organizationAgeGroups.some((group) => group.key === value)

/** ?q=&province=&age=&category=&remote=1&page= → bộ lọc; giá trị lạ trên URL bị bỏ qua thay vì gửi lên backend (400) */
export function parseOrganizationSearch(searchParams: URLSearchParams): OrganizationFilters {
  const q = searchParams.get('q')?.trim()
  // Backend nhận tỉnh từ 2 đến 100 ký tự
  const province = searchParams.get('province')?.trim()
  const age = searchParams.get('age')
  const categoryId = searchParams.get('category')
  const page = Number(searchParams.get('page'))
  return {
    q: q || undefined,
    province: province && province.length >= 2 && province.length <= 100 ? province : undefined,
    age: isAgeGroupKey(age) ? age : undefined,
    categoryId: categoryId && /^[0-9a-f]{24}$/i.test(categoryId) ? categoryId : undefined,
    remoteOnly: searchParams.get('remote') === '1' || undefined,
    page: Number.isInteger(page) && page > 0 ? page : 1,
  }
}

/** Bộ lọc → URLSearchParams (bỏ giá trị rỗng và trang 1 để URL gọn) */
export function toOrganizationSearch(filters: OrganizationFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.q) params.set('q', filters.q)
  if (filters.province) params.set('province', filters.province)
  if (filters.age) params.set('age', filters.age)
  if (filters.categoryId) params.set('category', filters.categoryId)
  if (filters.remoteOnly) params.set('remote', '1')
  if (filters.page > 1) params.set('page', String(filters.page))
  return params
}

export const organizationListQuery = (filters: OrganizationFilters) => {
  const ageGroup = organizationAgeGroups.find((group) => group.key === filters.age)
  const params: PublicOrganizationListParams = {
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.province ? { province: filters.province } : {}),
    // Nhóm tuổi: tổ chức có nhóm tuổi giao với khoảng này (GET /organizations?minAge=&maxAge=)
    ...(ageGroup ? { minAge: ageGroup.minAge, maxAge: ageGroup.maxAge } : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.remoteOnly ? { remoteOnly: true } : {}),
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
