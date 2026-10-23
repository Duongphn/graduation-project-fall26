import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ChevronRight, Home, Truck } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'

import { QueryErrorAlert, StatusTag } from '../components/common'
import { CancelDonationCard } from '../features/donations/components/cancel-donation-card'
import { DonationDecisionCard } from '../features/donations/components/donation-decision-card'
import { DonationProgress } from '../features/donations/components/donation-progress'
import { DonationReceiverCard } from '../features/donations/components/donation-receiver-card'
import { DonationTimeline } from '../features/donations/components/DonationTimeline'
import { DonationToyCard } from '../features/donations/components/donation-toy-card'
import { ShipDonationForm } from '../features/donations/components/ship-donation-form'
import { myDonationQuery, useMyDonationActions } from '../features/donations/donor-queries'
import { formatDateTime } from '../features/donations/format'
import type { DonationRequestDetail } from '../features/donations/types'
import { profileQuery } from '../features/profile/profile-queries'
import { SiteLayout } from '../layouts/site/site-layout'
import { PATHS } from '../routes/paths'

/** Tên bên nhận: tổ chức (phiếu do Admin tạo thay tổ chức) hoặc người dùng đăng ký nhận */
const receiverNameOf = (request: DonationRequestDetail) =>
  request.organization?.name ?? request.requester?.fullName ?? 'Bên nhận'

/** Donor xem phiếu quyên góp: đồng ý/từ chối, đánh dấu đã gửi (mã vận đơn), huỷ trước khi gửi (UC27) */
export function MyDonationDetailPage() {
  const { requestId = '' } = useParams()
  const detail = useQuery(myDonationQuery(requestId))
  const profile = useQuery(profileQuery)
  const actions = useMyDonationActions(requestId)
  const request = detail.data

  useEffect(() => {
    document.title = `${request ? `Phiếu ${request.code}` : 'Phiếu quyên góp'} | ToyFlow`
  }, [request])

  // Thao tác chỉ dành cho người tặng; người đăng ký nhận mở cùng phiếu sẽ chỉ xem
  const isDonor = Boolean(request && profile.data && request.donor?.id === profile.data.id)
  const canCancel = isDonor && (request?.status === 'pending' || request?.status === 'accepted')

  return (
    <SiteLayout>
      <div className="home-container py-6 sm:py-8">
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-xs text-tf-ink-muted">
          <Link to={PATHS.home} className="inline-flex shrink-0 items-center gap-1 hover:text-tf-primary">
            <Home className="size-3.5" aria-hidden /> Trang chủ
          </Link>
          <ChevronRight className="size-3.5 shrink-0" aria-hidden />
          <Link to={PATHS.myDonations} className="shrink-0 hover:text-tf-primary">
            Quyên góp của tôi
          </Link>
          {request && (
            <>
              <ChevronRight className="size-3.5 shrink-0" aria-hidden />
              <span aria-current="page" className="truncate font-medium text-tf-ink">
                Phiếu {request.code}
              </span>
            </>
          )}
        </nav>

        {detail.isPending && (
          <div aria-hidden className="mt-6 flex flex-col gap-4">
            <span className="h-9 w-2/3 animate-pulse rounded-lg bg-tf-surface" />
            <span className="h-24 animate-pulse rounded-xl bg-tf-surface" />
            <span className="h-64 animate-pulse rounded-xl bg-tf-surface" />
          </div>
        )}

        {detail.isError && (
          <div className="mt-6 flex flex-col gap-4">
            <QueryErrorAlert error={detail.error} onRetry={() => void detail.refetch()} />
            <Link
              to={PATHS.myDonations}
              className="inline-flex h-10 items-center gap-2 self-start rounded-lg border border-tf-surface bg-white px-4 text-sm font-semibold text-tf-primary hover:border-tf-primary"
            >
              <ArrowLeft className="size-4" aria-hidden /> Về danh sách quyên góp
            </Link>
          </div>
        )}

        {request && (
          <>
            <header className="mt-5">
              <h1 className="text-2xl leading-tight font-bold tracking-[-0.02em] text-tf-ink sm:text-3xl">
                Chi tiết phiếu quyên góp <span className="text-tf-primary">{request.code}</span>
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-tf-ink-muted">
                <StatusTag domain="donation" status={request.status} />
                <span>Tạo lúc {formatDateTime(request.createdAt)}</span>
              </div>
            </header>

            <section aria-label="Tiến trình quyên góp" className="mt-6">
              <DonationProgress request={request} />
            </section>

            <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <div className="flex min-w-0 flex-col gap-6">
                {isDonor && request.status === 'pending' && (
                  <DonationDecisionCard
                    requesterName={receiverNameOf(request)}
                    message={request.message}
                    accepting={actions.accept.isPending}
                    rejecting={actions.reject.isPending}
                    onAccept={() => actions.accept.mutate()}
                    onReject={(reason, onDone) => actions.reject.mutate(reason, { onSuccess: onDone })}
                  />
                )}

                {isDonor && request.status === 'accepted' && (
                  <ShipDonationForm
                    receiverName={receiverNameOf(request)}
                    loading={actions.handOver.isPending}
                    onSubmit={(input) => actions.handOver.mutate(input)}
                  />
                )}

                {request.status === 'shipping' && (
                  <p className="flex items-start gap-3 rounded-xl border border-tf-surface bg-white p-4 text-sm leading-6 text-tf-ink">
                    <Truck className="mt-0.5 size-5 shrink-0 text-tf-primary" aria-hidden />
                    Đồ chơi đang trên đường tới {receiverNameOf(request)}. Phiếu hoàn tất khi bên nhận xác nhận đã nhận
                    hàng.
                  </p>
                )}

                {canCancel && (
                  <CancelDonationCard
                    loading={actions.cancel.isPending}
                    onCancel={(note, onDone) => actions.cancel.mutate(note, { onSuccess: onDone })}
                  />
                )}

                <DonationToyCard toy={request.toy} />
                <DonationTimeline request={request} />
              </div>

              <aside className="flex flex-col gap-6 lg:sticky lg:top-20">
                <DonationReceiverCard request={request} />
              </aside>
            </div>
          </>
        )}
      </div>
    </SiteLayout>
  )
}
