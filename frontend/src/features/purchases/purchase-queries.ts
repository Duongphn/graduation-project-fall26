import { keepPreviousData, queryOptions } from '@tanstack/react-query'

import { purchaseApi, type DeliveryMethod, type PurchaseRole } from './purchase-api'

export const PURCHASE_PAGE_SIZE = 10

/** Mọi khoá dưới ['purchases'] để một lần invalidate làm mới cả danh sách lẫn chi tiết */
export const purchaseKeys = {
  all: ['purchases'] as const,
  list: (role: PurchaseRole, page: number) => [...purchaseKeys.all, 'list', role, page] as const,
  detail: (orderId: string) => [...purchaseKeys.all, 'detail', orderId] as const,
  quote: (toyId: string, method: DeliveryMethod) => [...purchaseKeys.all, 'quote', toyId, method] as const,
}

export const purchaseQuoteQuery = (toyId: string, method: DeliveryMethod) =>
  queryOptions({
    queryKey: purchaseKeys.quote(toyId, method),
    queryFn: () => purchaseApi.quote(toyId, method),
    staleTime: 30_000,
    retry: false,
  })

export const purchaseListQuery = (role: PurchaseRole, page: number) =>
  queryOptions({
    queryKey: purchaseKeys.list(role, page),
    queryFn: () => purchaseApi.list(role, page, PURCHASE_PAGE_SIZE),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    retry: false,
  })

export const purchaseDetailQuery = (orderId: string) =>
  queryOptions({
    queryKey: purchaseKeys.detail(orderId),
    queryFn: () => purchaseApi.detail(orderId),
    staleTime: 10_000,
    retry: false,
  })

/** ?page=2 trên URL danh sách đơn — giá trị lạ về trang 1 */
export const parsePurchasePage = (searchParams: URLSearchParams) => {
  const page = Number(searchParams.get('page'))
  return Number.isInteger(page) && page > 1 ? page : 1
}
