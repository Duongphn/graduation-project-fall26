import { queryOptions } from '@tanstack/react-query'
import { ageGroups, type AgeGroup } from '../../constants/domain'
import { vietnamProvinces, type VietnamProvince } from '../../constants/provinces'
import { getAccessToken } from '../../services/token-storage'
import { publicOrganizationsApi } from './public-api'
import type { PublicOrganizationListParams } from './types'

/** Dùng chung cho loader (tải trước) và useQuery trong trang (đọc cache) */

/** Backend chỉ trả số điện thoại cho người đã đăng nhập → khoá cache tách khách / đã đăng nhập */
const viewerKey = () => (getAccessToken() ? 'signed-in' : 'guest')

/** Chia hết cho 1, 2, 3 cột nên hàng cuối của lưới luôn đầy */
export const ORGANIZATION_PAGE_SIZE = 12

export interface OrganizationFilters {
  q?: string
  province?: VietnamProvince
  ageGroup?: AgeGroup
  page: number
}

const isProvince = (value: string | null): value is VietnamProvince =>
  value !== null && (vietnamProvinces as readonly string[]).includes(value)

const isAgeGroup = (value: string | null): value is AgeGroup =>
  value !== null && (ageGroups as readonly string[]).includes(value)

/** ?q=&province=&ageGroup=&page= → bộ lọc; giá trị lạ trên URL bị bỏ qua thay vì gửi lên backend (400) */
export function parseOrganizationSearch(searchParams: URLSearchParams): OrganizationFilters {
  const q = searchParams.get('q')?.trim()
  const province = searchParams.get('province')
  const ageGroup = searchParams.get('ageGroup')
  const page = Number(searchParams.get('page'))
  return {
    q: q || undefined,
    province: isProvince(province) ? province : undefined,
    ageGroup: isAgeGroup(ageGroup) ? ageGroup : undefined,
    page: Number.isInteger(page) && page > 0 ? page : 1,
  }
}

/** Bộ lọc → URLSearchParams (bỏ giá trị rỗng và trang 1 để URL gọn) */
export function toOrganizationSearch(filters: OrganizationFilters): URLSearchParams {
  const params = new URLSearchParams()
  if (filters.q) params.set('q', filters.q)
  if (filters.province) params.set('province', filters.province)
  if (filters.ageGroup) params.set('ageGroup', filters.ageGroup)
  if (filters.page > 1) params.set('page', String(filters.page))
  return params
}

export const organizationListQuery = (filters: OrganizationFilters) => {
  const params: PublicOrganizationListParams = {
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.province ? { province: filters.province } : {}),
    ...(filters.ageGroup ? { ageGroup: filters.ageGroup } : {}),
    page: filters.page,
    limit: ORGANIZATION_PAGE_SIZE,
    sortBy: 'name',
    sortOrder: 'asc',
  }
  return queryOptions({
    queryKey: ['public-organizations', viewerKey(), 'list', params],
    queryFn: () => publicOrganizationsApi.list(params),
    staleTime: 60_000,
    retry: false,
  })
}

export const organizationDetailQuery = (id: string) =>
  queryOptions({
    queryKey: ['public-organizations', viewerKey(), 'detail', id],
    queryFn: () => publicOrganizationsApi.get(id),
    staleTime: 60_000,
    retry: false,
  })
