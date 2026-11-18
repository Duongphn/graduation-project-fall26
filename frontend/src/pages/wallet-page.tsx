import { useQuery } from '@tanstack/react-query'
import { Pagination } from 'antd'
import { ArrowUpRight, CheckCircle2, ChevronRight, Home, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { QueryErrorAlert } from '../components/common'
import { TopupDialog } from '../features/wallet/components/topup-dialog'
import { WalletBalanceCards } from '../features/wallet/components/wallet-balance-cards'
import { WalletHistoryFilters } from '../features/wallet/components/wallet-history-filters'
import { WalletTransactionList } from '../features/wallet/components/wallet-transaction-list'
import { WithdrawDialog } from '../features/wallet/components/withdraw-dialog'
import { WithdrawalList } from '../features/wallet/components/withdrawal-list'
import { formatVnd } from '../features/toy-listings/format-vnd'
import type { WithdrawalRequest } from '../features/wallet/wallet-api'
import { parseTopupRequest } from '../features/wallet/topup-session'
import {
  myWalletQuery,
  myWithdrawalsQuery,
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
  // ?topup=50000&returnTo=/rentals/mine/… (từ khung thanh toán đơn thuê): mở sẵn hộp nạp tiền
  const topupRequest = parseTopupRequest(searchParams)
  const [topupOpen, setTopupOpen] = useState(false)
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  const [createdWithdrawal, setCreatedWithdrawal] = useState<WithdrawalRequest | null>(null)
  const wallet = useQuery(myWalletQuery)
  const history = useQuery(walletTransactionsQuery(filters))
  const withdrawals = useQuery(myWithdrawalsQuery)

  useEffect(() => {
    document.title = 'Ví ToyFlow | ToyFlow'
  }, [])

  const items = history.data?.items ?? []
  const total = history.data?.pagination.totalItems ?? 0
  const filtered = Boolean(filters.type || filters.direction)
  const showTopup = topupOpen || topupRequest !== undefined
  const recentWithdrawals = withdrawals.data?.items ?? []
  // Mỗi người chỉ có một lệnh rút đang chờ (server cũng chặn)
  const pendingWithdrawal = recentWithdrawals.find((withdrawal) => withdrawal.status === 'pending')

  const closeTopup = () => {
    setTopupOpen(false)
    // Bỏ ?topup=&returnTo= khỏi URL, giữ bộ lọc lịch sử
    if (searchParams.has('topup')) setSearchParams(toWalletHistorySearch(filters), { replace: true })
  }

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

      <header className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl leading-tight font-bold tracking-[-0.02em] text-tf-ink">Ví ToyFlow</h1>
          <p className="mt-1 text-sm text-tf-ink-muted">Số dư của bạn và mọi khoản tiền vào, ra khỏi ví.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTopupOpen(true)}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-tf-primary px-4 text-sm font-bold text-white hover:bg-tf-primary-container"
          >
            <Plus className="size-4" aria-hidden /> Nạp tiền
          </button>
          <button
            type="button"
            onClick={() => {
              setCreatedWithdrawal(null)
              setWithdrawOpen(true)
            }}
            disabled={!wallet.data || pendingWithdrawal !== undefined}
            title={pendingWithdrawal ? 'Bạn đang có một lệnh rút chờ xử lý' : undefined}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-tf-surface bg-white px-4 text-sm font-semibold text-tf-primary hover:border-tf-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ArrowUpRight className="size-4" aria-hidden /> Rút tiền
          </button>
        </div>
      </header>

      <div aria-live="polite">
        {createdWithdrawal && (
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
            Đã tạo lệnh rút {formatVnd(createdWithdrawal.amount)}. Số tiền đã được tạm trừ khỏi số dư khả dụng và sẽ
            được chuyển về {createdWithdrawal.bankInfo.bankName} sau khi ToyFlow duyệt.
          </p>
        )}
      </div>

      <div className="mt-4">
        {wallet.isError ? (
          <QueryErrorAlert error={wallet.error} onRetry={() => void wallet.refetch()} />
        ) : (
          <WalletBalanceCards wallet={wallet.data} />
        )}
      </div>

      {recentWithdrawals.length > 0 && (
        <section aria-labelledby="wallet-withdrawals-title" className="mt-6 flex flex-col gap-3">
          <div>
            <h2 id="wallet-withdrawals-title" className="text-lg font-bold text-tf-ink">
              Lệnh rút tiền
            </h2>
            {pendingWithdrawal && (
              <p className="text-sm text-tf-ink-muted">
                Bạn có một lệnh đang chờ xử lý; có thể tạo lệnh mới sau khi lệnh này hoàn tất.
              </p>
            )}
          </div>
          <WithdrawalList withdrawals={recentWithdrawals} />
        </section>
      )}

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

      {withdrawOpen && wallet.data && (
        <WithdrawDialog
          availableBalance={wallet.data.availableBalance}
          onClose={() => setWithdrawOpen(false)}
          onCreated={(withdrawal) => {
            setWithdrawOpen(false)
            setCreatedWithdrawal(withdrawal)
          }}
        />
      )}

      {showTopup && (
        <TopupDialog onClose={closeTopup} initialAmount={topupRequest?.amount} returnTo={topupRequest?.returnTo} />
      )}
    </AccountLayout>
  )
}
