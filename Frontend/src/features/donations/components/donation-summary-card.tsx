import { useQuery } from '@tanstack/react-query'
import { ArrowRight, HandHeart } from 'lucide-react'
import { Link } from 'react-router-dom'

import { PATHS } from '../../../routes/paths'
import { donationSummaryQuery } from '../donor-queries'

const countFormatter = new Intl.NumberFormat('vi-VN')

/** Thẻ trên Hồ sơ của tôi: số lượt quyên góp đã được bên nhận xác nhận (GET /users/:id/donation-summary) */
export function DonationSummaryCard({ userId }: { userId: string }) {
  const summary = useQuery(donationSummaryQuery(userId))
  const count = summary.data?.completedDonations

  return (
    <section
      aria-labelledby="donation-summary-title"
      className="flex flex-col gap-4 rounded-xl border border-tf-surface bg-white p-5 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-center gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-tf-secondary-container text-tf-secondary">
          <HandHeart className="size-6" aria-hidden />
        </span>
        <div>
          <h2 id="donation-summary-title" className="text-base font-bold text-tf-ink">
            Quyên góp từ thiện
          </h2>
          <p className="text-sm text-tf-ink-muted">
            {summary.isPending ? (
              'Đang tải…'
            ) : summary.isError ? (
              'Chưa tải được số lượt quyên góp.'
            ) : (
              <>
                Đã trao tặng <strong className="text-tf-ink tabular-nums">{countFormatter.format(count ?? 0)}</strong>{' '}
                món đồ chơi được bên nhận xác nhận.
              </>
            )}
          </p>
        </div>
      </div>
      <Link
        to={PATHS.donationHistory}
        className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-tf-surface px-4 text-sm font-semibold text-tf-primary hover:border-tf-primary"
      >
        Xem lịch sử quyên góp <ArrowRight className="size-4" aria-hidden />
      </Link>
    </section>
  )
}
