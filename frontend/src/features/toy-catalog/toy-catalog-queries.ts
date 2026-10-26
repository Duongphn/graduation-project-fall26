import { queryOptions } from '@tanstack/react-query'
import { fetchToyAvailability, fetchToyDetail, searchToys, type CatalogFilters } from './toy-catalog-api'

/** Dùng chung cho loader (tải trước) và useQuery trong trang (đọc cache) */

/** Các cỡ trang đều chia hết cho 1, 2, 3 cột nên hàng cuối của lưới luôn đầy */
export const PAGE_SIZE_OPTIONS = [12, 24, 48] as const
export const CATALOG_PAGE_SIZE = PAGE_SIZE_OPTIONS[0]

export const toySearchQuery = (filters: CatalogFilters) =>
  queryOptions({
    queryKey: ['toy-search', filters],
    queryFn: () => searchToys({ ...filters, limit: filters.limit ?? CATALOG_PAGE_SIZE }),
    staleTime: 30_000,
    retry: false,
  })

export const toyDetailQuery = (toyId: string) =>
  queryOptions({
    queryKey: ['toy-detail', toyId],
    queryFn: () => fetchToyDetail(toyId),
    staleTime: 60_000,
    retry: false,
  })

export const toyAvailabilityQuery = (toyId: string, from: string, to: string) =>
  queryOptions({
    queryKey: ['toy-availability', toyId, from, to],
    queryFn: () => fetchToyAvailability(toyId, from, to),
    staleTime: 60_000,
    retry: false,
  })
