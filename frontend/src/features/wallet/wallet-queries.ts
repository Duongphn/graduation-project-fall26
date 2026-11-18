import { keepPreviousData, queryOptions } from '@tanstack/react-query'

import {
  walletApi,
  walletTransactionDirections,
  walletTransactionTypes,
  type WalletTransactionDirection,
  type WalletTransactionType,
} from './wallet-api'

export const WALLET_HISTORY_PAGE_SIZE = 10

export interface WalletHistoryFilters {
  type?: WalletTransactionType
  direction?: WalletTransactionDirection
  page: number
}

const isType = (value: string | null): value is WalletTransactionType =>
  walletTransactionTypes.includes(value as WalletTransactionType)

const isDirection = (value: string | null): value is WalletTransactionDirection =>
  walletTransactionDirections.includes(value as WalletTransactionDirection)

/** Bộ lọc trên URL: ?type=rental&direction=debit&page=2 — giá trị lạ bị bỏ qua */
export function parseWalletHistorySearch(searchParams: URLSearchParams): WalletHistoryFilters {
  const type = searchParams.get('type')
  const direction = searchParams.get('direction')
  const page = Number(searchParams.get('page'))
  return {
    type: isType(type) ? type : undefined,
    direction: isDirection(direction) ? direction : undefined,
    page: Number.isInteger(page) && page > 1 ? page : 1,
  }
}

export function toWalletHistorySearch({ type, direction, page }: WalletHistoryFilters) {
  const params = new URLSearchParams()
  if (type) params.set('type', type)
  if (direction) params.set('direction', direction)
  if (page > 1) params.set('page', String(page))
  return params
}

/** Mọi key nằm dưới ['wallet', 'me'] nên invalidate walletKeys.me làm mới cả số dư lẫn lịch sử */
export const walletKeys = {
  me: ['wallet', 'me'] as const,
  transactions: (filters: WalletHistoryFilters) => [...walletKeys.me, 'transactions', filters] as const,
  withdrawals: ['wallet', 'me', 'withdrawals'] as const,
}

/** Số lệnh rút gần nhất hiện trên màn hình ví */
export const RECENT_WITHDRAWALS_LIMIT = 5

export const myWithdrawalsQuery = queryOptions({
  queryKey: walletKeys.withdrawals,
  queryFn: () => walletApi.myWithdrawals({ page: 1, limit: RECENT_WITHDRAWALS_LIMIT }),
  staleTime: 10_000,
  retry: false,
})

export const myWalletQuery = queryOptions({
  queryKey: walletKeys.me,
  queryFn: walletApi.me,
  staleTime: 10_000,
  retry: false,
})

export const walletTransactionsQuery = (filters: WalletHistoryFilters) =>
  queryOptions({
    queryKey: walletKeys.transactions(filters),
    queryFn: () =>
      walletApi.transactions({
        page: filters.page,
        limit: WALLET_HISTORY_PAGE_SIZE,
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.direction ? { direction: filters.direction } : {}),
      }),
    placeholderData: keepPreviousData,
    staleTime: 10_000,
    retry: false,
  })
