import { useQuery } from '@tanstack/react-query'
import { Pagination } from 'antd'
import { ChevronRight, Home } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { QueryErrorAlert } from '../components/common'
import { WalletBalanceCards } from '../features/wallet/components/wallet-balance-cards'
import { WalletHistoryFilters } from '../features/wallet/components/wallet-history-filters'
import { WalletTransactionList } from '../features/wallet/components/wallet-transaction-list'
import {
  myWalletQuery,
  parseWalletHistorySearch,
  toWalletHistorySearch,
  WALLET_HISTORY_PAGE_SIZE,
  walletTransactionsQuery,
} from '../features/wallet/wallet-queries'
import { AccountLayout } from '../layouts/account/account-layout'
import { PATHS } from '../routes/paths'

/** Màn hình ví: số dư khả dụng / đang tạm giữ, lịch sử giao dịch lọc theo loại + phân trang */
export function WalletPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = parseWalletHistorySearch(searchParams)
  const wallet = useQuery(myWalletQuery)
  const history = useQuery(walletTransactionsQuery(filters))

  useEffect(() => {
    document.title = 'Ví ToyFlow | ToyFlow'
  }, [])

  const items = history.data?.items ?? []
  const total = history.data?.pagination.totalItems ?? 0
  const filtered = Boolean(filters.type || filters.direction)

  return (
    <AccountLayout activeItem="wallet">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-tf-ink-muted">
        <Link to={PATHS.home} className="inline-flex items-center gap-1 hover:text-tf-primary">
          <Home className="size-3.5" aria-hidden /> Trang chủ
        </Link>
        <ChevronRight className="size-3.5" aria-hidden />
        <span aria-current="page" className="font-medium text-tf-ink">
          Ví ToyFlow
        </span>
      </nav>

      <header className="mt-4">
        <h1 className="text-2xl leading-tight font-bold tracking-[-0.02em] text-tf-ink">Ví ToyFlow</h1>
        <p className="mt-1 text-sm text-tf-ink-muted">Số dư của bạn và mọi khoản tiền vào, ra khỏi ví.</p>
      </header>

      <div className="mt-4">
        {wallet.isError ? (
          <QueryErrorAlert error={wallet.error} onRetry={() => void wallet.refetch()} />
        ) : (
          <WalletBalanceCards wallet={wallet.data} />
        )}
      </div>

      <section aria-labelledby="wallet-history-title" className="mt-6 flex flex-col gap-4">
        <h2 id="wallet-history-title" className="text-lg font-bold text-tf-ink">
          Lịch sử giao dịch
        </h2>

        <WalletHistoryFilters
          type={filters.type}
          direction={filters.direction}
          onTypeChange={(type) => setSearchParams(toWalletHistorySearch({ ...filters, type, page: 1 }))}
          onDirectionChange={(direction) => setSearchParams(toWalletHistorySearch({ ...filters, direction, page: 1 }))}
        />

        {history.isPending &&
          Array.from({ length: 4 }, (_, index) => (
            <span key={index} aria-hidden className="h-16 animate-pulse rounded-xl bg-tf-surface" />
          ))}

        {history.isError && !history.data && (
          <QueryErrorAlert error={history.error} onRetry={() => void history.refetch()} />
        )}

        {history.isSuccess && items.length === 0 && (
          <div className="rounded-xl border border-dashed border-tf-outline bg-white px-6 py-10 text-center">
            <p className="font-semibold text-tf-ink">
              {filtered ? 'Không có giao dịch nào khớp bộ lọc.' : 'Ví của bạn chưa có giao dịch nào.'}
            </p>
            <p className="mt-1 text-sm text-tf-ink-muted">
              {filtered
                ? 'Thử chọn loại khác hoặc bỏ bộ lọc.'
                : 'Các khoản thanh toán đơn thuê, hoàn cọc và nạp tiền sẽ hiện ở đây.'}
            </p>
          </div>
        )}

        {items.length > 0 && <WalletTransactionList transactions={items} />}

        {total > WALLET_HISTORY_PAGE_SIZE && (
          <Pagination
            className="self-center"
            current={filters.page}
            pageSize={WALLET_HISTORY_PAGE_SIZE}
            total={total}
            showSizeChanger={false}
            onChange={(page) => setSearchParams(toWalletHistorySearch({ ...filters, page }))}
          />
        )}
      </section>
    </AccountLayout>
  )
}
