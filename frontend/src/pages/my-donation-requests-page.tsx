import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Pagination } from 'antd'
import { ChevronRight, Gift, Home, ImageOff } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { QueryErrorAlert, StatusTabs, StatusTag } from '../components/common'
import {
  MY_DONATIONS_PAGE_SIZE,
  parseMyDonationsSearch,
  toMyDonationsSearch,
} from '../features/donations/donor-queries'
import { formatDateTime } from '../features/donations/format'
import { myRequestsQuery } from '../features/donations/receiver-queries'
import type { DonationRequest } from '../features/donations/types'
import { SiteLayout } from '../layouts/site/site-layout'
import { DONATE_TOYS_ANCHOR, myDonationRequestPath, PATHS } from '../routes/paths'

const donateToysLink = `${PATHS.home}#${DONATE_TOYS_ANCHOR}`

function RequestRow({ request }: { request: DonationRequest }) {
  return (
    <li>
      <Link
        to={myDonationRequestPath(request.id)}
        className="flex gap-4 rounded-xl border border-tf-surface bg-white p-4 transition-colors hover:border-tf-primary"
      >
        {request.toy?.imageUrl ? (
          <img src={request.toy.imageUrl} alt="" loading="lazy" className="size-20 shrink-0 rounded-lg object-cover" />
        ) : (
          <span className="grid size-20 shrink-0 place-items-center rounded-lg bg-tf-page text-tf-ink-muted">
            <ImageOff className="size-5" aria-hidden />
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-tf-primary">{request.code}</span>
            <StatusTag domain="donation" status={request.status} />
          </span>
          <span className="truncate text-base font-semibold text-tf-ink">
            {request.toy?.title ?? 'Đồ chơi không còn tồn tại'}
          </span>
          <span className="text-sm text-tf-ink-muted">
            Người tặng: <span className="text-tf-ink">{request.donor?.fullName ?? 'Người tặng'}</span> · Cập nhật{' '}
            {formatDateTime(request.updatedAt)}
          </span>
        </span>
        <ChevronRight className="size-5 shrink-0 self-center text-tf-ink-muted" aria-hidden />
      </Link>
    </li>
  )
}

/** Bên nhận theo dõi các yêu cầu nhận đồ chơi quyên góp của mình (GET /donation-requests/mine) */
export function MyDonationRequestsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = useMemo(() => parseMyDonationsSearch(searchParams), [searchParams])
  const list = useQuery({ ...myRequestsQuery(filters), placeholderData: keepPreviousData })
  const items = list.data?.items ?? []
  const total = list.data?.pagination.totalItems ?? 0

  useEffect(() => {
    document.title = 'Yêu cầu nhận đồ của tôi | ToyFlow'
  }, [])

  return (
    <SiteLayout>
      <div className="home-container py-6 sm:py-8">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-tf-ink-muted">
          <Link to={PATHS.home} className="inline-flex items-center gap-1 hover:text-tf-primary">
            <Home className="size-3.5" aria-hidden /> Trang chủ
          </Link>
          <ChevronRight className="size-3.5" aria-hidden />
          <span aria-current="page" className="font-medium text-tf-ink">
            Yêu cầu nhận đồ của tôi
          </span>
        </nav>

        <header className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-3xl leading-tight font-bold tracking-[-0.02em] text-tf-ink">Yêu cầu nhận đồ của tôi</h1>
            <p className="mt-2 text-[15px] leading-7 text-tf-ink-muted">
              Theo dõi các đồ chơi quyên góp bạn đã xin nhận: chờ người tặng đồng ý, liên hệ nhận đồ và xác nhận khi đã
              nhận.
            </p>
          </div>
          <Link
            to={donateToysLink}
            className="inline-flex h-10 shrink-0 items-center gap-2 self-start rounded-full bg-tf-primary px-4 text-sm font-bold text-white hover:bg-tf-primary-container sm:self-auto"
          >
            <Gift className="size-4" aria-hidden /> Xem đồ chơi quyên góp
          </Link>
        </header>

        <div className="mt-4">
          <StatusTabs
            domain="donation"
            value={filters.status}
            onChange={(status) => setSearchParams(toMyDonationsSearch({ status, page: 1 }))}
          />
        </div>

        <section aria-label="Danh sách yêu cầu nhận đồ" className="flex flex-col gap-3">
          {list.isPending &&
            Array.from({ length: 3 }, (_, index) => (
              <span key={index} aria-hidden className="h-28 animate-pulse rounded-xl bg-tf-surface" />
            ))}

          {list.isError && !list.data && <QueryErrorAlert error={list.error} onRetry={() => void list.refetch()} />}

          {list.isSuccess && items.length === 0 && (
            <div className="rounded-xl border border-dashed border-tf-outline bg-white px-6 py-10 text-center">
              <p className="font-semibold text-tf-ink">Chưa có yêu cầu nhận đồ nào.</p>
              <p className="mt-1 text-sm text-tf-ink-muted">
                Chọn một món đồ chơi quyên góp và bấm “Xin nhận đồ chơi này” để gửi yêu cầu tới người tặng.
              </p>
              <Link
                to={donateToysLink}
                className="mt-4 inline-flex h-10 items-center rounded-lg border border-tf-surface px-4 text-sm font-semibold text-tf-primary hover:border-tf-primary"
              >
                Xem đồ chơi quyên góp
              </Link>
            </div>
          )}

          {items.length > 0 && (
            <ul className="flex flex-col gap-3">
              {items.map((request) => (
                <RequestRow key={request.id} request={request} />
              ))}
            </ul>
          )}

          {total > MY_DONATIONS_PAGE_SIZE && (
            <Pagination
              className="self-center"
              current={filters.page}
              pageSize={MY_DONATIONS_PAGE_SIZE}
              total={total}
              showSizeChanger={false}
              onChange={(page) => setSearchParams(toMyDonationsSearch({ ...filters, page }))}
            />
          )}
        </section>
      </div>
    </SiteLayout>
  )
}
