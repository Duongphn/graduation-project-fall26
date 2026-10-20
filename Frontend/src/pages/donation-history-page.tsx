import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Clock, Gift, Home, Plus, Truck, type LucideIcon } from 'lucide-react'
import { useEffect } from 'react'
import { Link } from 'react-router-dom'

import { QueryErrorAlert } from '../components/common'
import { CompletedDonationCard } from '../features/donations/components/completed-donation-card'
import { completedDonationsQuery, donationSummaryQuery, myDonationsQuery } from '../features/donations/donor-queries'
import { profileQuery } from '../features/profile/profile-queries'
import { AccountLayout } from '../layouts/account/account-layout'
import { PATHS } from '../routes/paths'

const countFormatter = new Intl.NumberFormat('vi-VN')

function Stat({ icon: Icon, value, label, tone }: { icon: LucideIcon; value: number | undefined; label: string; tone: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-tf-surface bg-white p-4">
      <span className={`grid size-11 shrink-0 place-items-center rounded-lg ${tone}`}>
        <Icon className="size-5" aria-hidden />
      </span>
      <span>
        <span className="block text-2xl leading-7 font-bold text-tf-ink tabular-nums">
          {value === undefined ? '…' : countFormatter.format(value)}
        </span>
        <span className="text-xs text-tf-ink-muted">{label}</span>
      </span>
    </div>
  )
}

/** Hồ sơ người tặng: các lượt quyên góp đã được bên nhận xác nhận (UC27, COMPLETED) */
export function DonationHistoryPage() {
  const profile = useQuery(profileQuery)
  const userId = profile.data?.id ?? ''
  const summary = useQuery({ ...donationSummaryQuery(userId), enabled: Boolean(userId) })
  // Chỉ cần tổng số (pagination.totalItems) của từng trạng thái
  const shipping = useQuery(myDonationsQuery({ status: 'SHIPPING', page: 1 }))
  const pending = useQuery(myDonationsQuery({ status: 'PENDING', page: 1 }))
  const accepted = useQuery(myDonationsQuery({ status: 'ACCEPTED', page: 1 }))
  const completed = useInfiniteQuery(completedDonationsQuery)

  useEffect(() => {
    document.title = 'Lịch sử quyên góp | ToyFlow'
  }, [])

  const waiting =
    pending.data && accepted.data
      ? pending.data.pagination.totalItems + accepted.data.pagination.totalItems
      : undefined
  const items = completed.data?.pages.flatMap((page) => page.items) ?? []
  const total = completed.data?.pages[0]?.pagination.totalItems ?? 0

  return (
    <AccountLayout activeItem="donations">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-tf-ink-muted">
        <Link to={PATHS.home} className="inline-flex items-center gap-1 hover:text-tf-primary">
          <Home className="size-3.5" aria-hidden /> Trang chủ
        </Link>
        <ChevronRight className="size-3.5" aria-hidden />
        <Link to={PATHS.profile} className="hover:text-tf-primary">
          Hồ sơ của tôi
        </Link>
        <ChevronRight className="size-3.5" aria-hidden />
        <span aria-current="page" className="font-medium text-tf-ink">
          Lịch sử quyên góp từ thiện
        </span>
      </nav>

      <section className="mt-4 rounded-2xl bg-tf-primary-fixed p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl leading-tight font-bold tracking-[-0.02em] text-tf-ink">
              {profile.data?.fullName ?? 'Lịch sử quyên góp'}
            </h1>
            <p className="mt-1 text-sm text-tf-ink-muted">
              Những món đồ chơi bạn trao đi đã được mái ấm và các bé xác nhận nhận được.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to={PATHS.newDonation}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-tf-primary px-4 text-sm font-bold text-white hover:bg-tf-primary-container"
            >
              <Plus className="size-4" aria-hidden /> Tạo phiếu quyên góp
            </Link>
            <Link
              to={PATHS.myDonations}
              className="inline-flex h-10 items-center rounded-full border border-tf-surface bg-white px-4 text-sm font-semibold text-tf-primary hover:border-tf-primary"
            >
              Quản lý phiếu
            </Link>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Stat
            icon={Gift}
            value={summary.data?.completedDonations}
            label="Món đồ chơi đã trao tặng"
            tone="bg-tf-secondary-container text-tf-secondary"
          />
          <Stat
            icon={Truck}
            value={shipping.data?.pagination.totalItems}
            label="Đang trên đường tới bên nhận"
            tone="bg-tf-primary-fixed text-tf-primary"
          />
          <Stat icon={Clock} value={waiting} label="Đang chờ bạn xử lý" tone="bg-amber-50 text-amber-700" />
        </div>
      </section>

      <section aria-labelledby="history-title" className="mt-6 flex flex-col gap-4">
        <div>
          <h2 id="history-title" className="text-lg font-bold text-tf-ink">
            Đợt quyên góp đã hoàn tất
          </h2>
          <p className="text-sm text-tf-ink-muted">Chỉ gồm các lượt bên nhận đã xác nhận kèm ảnh nhận hàng.</p>
        </div>

        {completed.isPending &&
          Array.from({ length: 2 }, (_, index) => (
            <span key={index} aria-hidden className="h-48 animate-pulse rounded-xl bg-tf-surface" />
          ))}

        {completed.isError && <QueryErrorAlert error={completed.error} onRetry={() => void completed.refetch()} />}

        {completed.isSuccess && items.length === 0 && (
          <div className="rounded-xl border border-dashed border-tf-outline bg-white px-6 py-10 text-center">
            <p className="font-semibold text-tf-ink">Chưa có lượt quyên góp nào được xác nhận.</p>
            <p className="mt-1 text-sm text-tf-ink-muted">
              Lượt quyên góp hiện ở đây khi bên nhận xác nhận đã nhận đồ chơi.
            </p>
            <Link
              to={PATHS.newDonation}
              className="mt-4 inline-flex h-10 items-center rounded-lg border border-tf-surface px-4 text-sm font-semibold text-tf-primary hover:border-tf-primary"
            >
              Tạo phiếu quyên góp đầu tiên
            </Link>
          </div>
        )}

        {items.map((request) => (
          <CompletedDonationCard key={request.id} request={request} />
        ))}

        {completed.hasNextPage && (
          <button
            type="button"
            onClick={() => void completed.fetchNextPage()}
            disabled={completed.isFetchingNextPage}
            className="inline-flex h-10 items-center gap-2 self-center rounded-full border border-tf-surface bg-white px-5 text-sm font-semibold text-tf-primary hover:border-tf-primary disabled:opacity-60"
          >
            {completed.isFetchingNextPage ? 'Đang tải…' : `Xem thêm ${total - items.length} lượt quyên góp`}
            <ChevronDown className="size-4" aria-hidden />
          </button>
        )}
      </section>
    </AccountLayout>
  )
}
