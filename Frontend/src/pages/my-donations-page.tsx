import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Pagination } from 'antd'
import { ChevronRight, Home, ImageOff } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { QueryErrorAlert, StatusTabs, StatusTag } from '../components/common'
import { formatDateTime } from '../features/donations/format'
import {
  MY_DONATIONS_PAGE_SIZE,
  myDonationsQuery,
  parseMyDonationsSearch,
  toMyDonationsSearch,
} from '../features/donations/donor-queries'
import type { DonationRequest } from '../features/donations/types'
import { SiteLayout } from '../layouts/site/site-layout'
import { myDonationPath, PATHS } from '../routes/paths'

function DonationRow({ request }: { request: DonationRequest }) {
  const receiver = request.organization?.name ?? request.requester?.fullName ?? 'Bên nhận'
  return (
    <li>
      <Link
        to={myDonationPath(request.id)}
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
            Bên nhận: <span className="text-tf-ink">{receiver}</span> · Cập nhật {formatDateTime(request.updatedAt)}
          </span>
        </span>
        <ChevronRight className="size-5 shrink-0 self-center text-tf-ink-muted" aria-hidden />
      </Link>
    </li>
  )
}

/** Donor quản lý các phiếu quyên góp trên đồ chơi của mình (GET /donation-requests/incoming) */
export function MyDonationsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = useMemo(() => parseMyDonationsSearch(searchParams), [searchParams])
  const list = useQuery({ ...myDonationsQuery(filters), placeholderData: keepPreviousData })
  const items = list.data?.items ?? []
  const total = list.data?.pagination.totalItems ?? 0

  useEffect(() => {
    document.title = 'Quyên góp của tôi | ToyFlow'
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
            Quyên góp của tôi
          </span>
        </nav>

        <header className="mt-5 max-w-2xl">
          <h1 className="text-3xl leading-tight font-bold tracking-[-0.02em] text-tf-ink">Quyên góp của tôi</h1>
          <p className="mt-2 text-[15px] leading-7 text-tf-ink-muted">
            Các yêu cầu nhận đồ chơi bạn tặng: đồng ý, gửi hàng kèm mã vận đơn hoặc huỷ trước khi gửi.
          </p>
        </header>

        <div className="mt-4">
          <StatusTabs
            domain="donation"
            value={filters.status}
            onChange={(status) => setSearchParams(toMyDonationsSearch({ status, page: 1 }))}
          />
        </div>

        <section aria-label="Danh sách phiếu quyên góp" className="flex flex-col gap-3">
          {list.isPending &&
            Array.from({ length: 3 }, (_, index) => (
              <span key={index} aria-hidden className="h-28 animate-pulse rounded-xl bg-tf-surface" />
            ))}

          {list.isError && !list.data && <QueryErrorAlert error={list.error} onRetry={() => void list.refetch()} />}

          {list.isSuccess && items.length === 0 && (
            <div className="rounded-xl border border-dashed border-tf-outline bg-white px-6 py-10 text-center">
              <p className="font-semibold text-tf-ink">Chưa có phiếu quyên góp nào.</p>
              <p className="mt-1 text-sm text-tf-ink-muted">
                Khi có người hoặc tổ chức đăng ký nhận đồ chơi bạn tặng, phiếu sẽ hiện ở đây.
              </p>
              <Link
                to={PATHS.charityOrganizations}
                className="mt-4 inline-flex h-10 items-center rounded-lg border border-tf-surface px-4 text-sm font-semibold text-tf-primary hover:border-tf-primary"
              >
                Xem tổ chức từ thiện
              </Link>
            </div>
          )}

          {items.length > 0 && (
            <ul className="flex flex-col gap-3">
              {items.map((request) => (
                <DonationRow key={request.id} request={request} />
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
