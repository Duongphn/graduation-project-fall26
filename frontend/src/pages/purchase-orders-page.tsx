import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Home, ShoppingBag } from 'lucide-react'
import { useEffect } from 'react'
import { Link, NavLink, useSearchParams } from 'react-router-dom'

import type { PurchaseRole } from '../features/purchases/purchase-api'
import { PURCHASE_STATUS_LABELS, PURCHASE_STATUS_TONES, nextAction } from '../features/purchases/purchase-display'
import { parsePurchasePage, purchaseListQuery } from '../features/purchases/purchase-queries'
import { formatDateTime } from '../features/rentals/rental-display'
import { formatVnd } from '../features/toy-listings/format-vnd'
import { AccountLayout } from '../layouts/account/account-layout'
import { PATHS, purchaseOrderPath } from '../routes/paths'
import { getErrorMessage } from '../services/api-error'

const TABS: Array<{ role: PurchaseRole; label: string; to: string }> = [
  { role: 'buyer', label: 'Đơn mua', to: PATHS.purchases },
  { role: 'seller', label: 'Đơn bán', to: PATHS.sales },
]

/** Danh sách đơn mua (người mua) hoặc đơn bán (người bán), mới nhất trước, phân trang ?page= */
export function PurchaseOrdersPage({ role }: { role: PurchaseRole }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const page = parsePurchasePage(searchParams)
  const list = useQuery(purchaseListQuery(role, page))
  const items = list.data?.items ?? []
  const pagination = list.data?.pagination

  useEffect(() => {
    document.title = `${role === 'seller' ? 'Đơn bán' : 'Đơn mua'} | ToyFlow`
  }, [role])

  const goTo = (next: number) => setSearchParams(next > 1 ? { page: String(next) } : {})

  return (
    <AccountLayout activeItem="purchases">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-tf-ink-muted">
        <Link to={PATHS.home} className="inline-flex items-center gap-1 hover:text-tf-primary">
          <Home className="size-3.5" aria-hidden /> Trang chủ
        </Link>
        <ChevronRight className="size-3.5" aria-hidden />
        <span aria-current="page" className="font-medium text-tf-ink">
          Đơn mua bán
        </span>
      </nav>

      <h1 className="mt-4 text-2xl leading-tight font-bold tracking-[-0.02em] text-tf-ink">Đơn mua bán</h1>

      <div role="tablist" aria-label="Loại đơn" className="mt-4 flex gap-2">
        {TABS.map((tab) => (
          <NavLink
            key={tab.role}
            to={tab.to}
            end
            role="tab"
            aria-selected={tab.role === role}
            className={`inline-flex h-9 items-center rounded-full border px-4 text-sm font-semibold transition-colors ${
              tab.role === role
                ? 'border-tf-primary bg-tf-primary text-white'
                : 'border-tf-surface bg-white text-tf-ink-muted hover:border-tf-primary hover:text-tf-primary'
            }`}
          >
            {tab.label}
          </NavLink>
        ))}
      </div>

      <section aria-label={role === 'seller' ? 'Danh sách đơn bán' : 'Danh sách đơn mua'} className="mt-4 flex flex-col gap-3">
        {list.isPending &&
          Array.from({ length: 3 }, (_, index) => (
            <span key={index} aria-hidden className="h-24 animate-pulse rounded-xl bg-tf-surface" />
          ))}

        {list.isError && !list.data && (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
            {getErrorMessage(list.error, 'Chưa tải được danh sách đơn.')}
            <button type="button" onClick={() => void list.refetch()} className="font-semibold underline">
              Thử lại
            </button>
          </div>
        )}

        {list.isSuccess && items.length === 0 && (
          <div className="rounded-xl border border-dashed border-tf-outline bg-white px-6 py-10 text-center">
            <ShoppingBag className="mx-auto size-8 text-tf-ink-muted" aria-hidden />
            <p className="mt-2 font-semibold text-tf-ink">
              {role === 'seller' ? 'Chưa có ai mua đồ của bạn.' : 'Bạn chưa mua món nào.'}
            </p>
            <Link
              to={role === 'seller' ? PATHS.myListings : `${PATHS.toys}?type=sell`}
              className="mt-3 inline-block text-sm font-semibold text-tf-primary hover:underline"
            >
              {role === 'seller' ? 'Xem tin đăng của tôi' : 'Tìm đồ chơi đang bán'}
            </Link>
          </div>
        )}

        {items.length > 0 && (
          <ul className="flex flex-col gap-3">
            {items.map((order) => {
              const action = nextAction(order, role)
              return (
                <li key={order.id}>
                  <Link
                    to={purchaseOrderPath(order.id)}
                    className="flex items-center gap-3 rounded-xl border border-tf-surface bg-white p-3 transition-colors hover:border-tf-primary sm:p-4"
                  >
                    <span className="size-16 shrink-0 overflow-hidden rounded-lg bg-tf-surface">
                      {order.itemDetails.image && <img src={order.itemDetails.image} alt="" className="size-full object-cover" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-tf-ink">{order.itemDetails.title}</span>
                      <span className="block text-xs text-tf-ink-muted">
                        {order.code} · {formatDateTime(order.createdAt)}
                      </span>
                      {action && <span className="mt-1 inline-block text-xs font-semibold text-amber-700">→ {action}</span>}
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${PURCHASE_STATUS_TONES[order.status]}`}>
                        {PURCHASE_STATUS_LABELS[order.status]}
                      </span>
                      <span className="text-sm font-bold text-tf-ink tabular-nums">
                        {formatVnd(role === 'seller' ? order.pricing.sellerNet : order.pricing.totalPayable)}
                      </span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}

        {pagination && pagination.totalPages > 1 && (
          <nav aria-label="Phân trang" className="flex items-center justify-center gap-3 text-sm">
            <button
              type="button"
              onClick={() => goTo(page - 1)}
              disabled={!pagination.hasPrevPage}
              className="inline-flex h-9 items-center gap-1 rounded-full border border-tf-surface bg-white px-3 font-semibold text-tf-ink disabled:opacity-40"
            >
              <ChevronLeft className="size-4" aria-hidden /> Trước
            </button>
            <span className="text-tf-ink-muted tabular-nums">
              Trang {pagination.page}/{pagination.totalPages}
            </span>
            <button
              type="button"
              onClick={() => goTo(page + 1)}
              disabled={!pagination.hasNextPage}
              className="inline-flex h-9 items-center gap-1 rounded-full border border-tf-surface bg-white px-3 font-semibold text-tf-ink disabled:opacity-40"
            >
              Sau <ChevronRight className="size-4" aria-hidden />
            </button>
          </nav>
        )}
      </section>
    </AccountLayout>
  )
}
