import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ChevronRight, Clock, Home } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'

import { QueryErrorAlert, StatusTag } from '../components/common'
import { CancelDonationCard } from '../features/donations/components/cancel-donation-card'
import { ConfirmReceiptForm } from '../features/donations/components/confirm-receipt-form'
import { DonationProgress } from '../features/donations/components/donation-progress'
import { DonationTimeline } from '../features/donations/components/DonationTimeline'
import { DonationToyCard } from '../features/donations/components/donation-toy-card'
import { DonorContactCard } from '../features/donations/components/donor-contact-card'
import { formatDateTime } from '../features/donations/format'
import { myRequestQuery, useMyRequestActions } from '../features/donations/receiver-queries'
import { SiteLayout } from '../layouts/site/site-layout'
import { PATHS } from '../routes/paths'

/** Bên nhận xem yêu cầu nhận đồ: tiến trình, liên hệ người tặng, huỷ, xác nhận đã nhận kèm ảnh */
export function MyDonationRequestDetailPage() {
  const { requestId = '' } = useParams()
  const detail = useQuery(myRequestQuery(requestId))
  const actions = useMyRequestActions(requestId)
  const request = detail.data

  useEffect(() => {
    document.title = `${request ? `Yêu cầu ${request.code}` : 'Yêu cầu nhận đồ'} | ToyFlow`
  }, [request])

  const donorName = request?.counterpartContact?.name ?? request?.donor?.fullName ?? 'Người tặng'
  const canCancel = request?.status === 'pending' || request?.status === 'accepted'

  return (
    <SiteLayout>
      <div className="home-container py-6 sm:py-8">
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-xs text-tf-ink-muted">
          <Link to={PATHS.home} className="inline-flex shrink-0 items-center gap-1 hover:text-tf-primary">
            <Home className="size-3.5" aria-hidden /> Trang chủ
          </Link>
          <ChevronRight className="size-3.5 shrink-0" aria-hidden />
          <Link to={PATHS.myDonationRequests} className="shrink-0 hover:text-tf-primary">
            Yêu cầu nhận đồ của tôi
          </Link>
          {request && (
            <>
              <ChevronRight className="size-3.5 shrink-0" aria-hidden />
              <span aria-current="page" className="truncate font-medium text-tf-ink">
                Yêu cầu {request.code}
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
              to={PATHS.myDonationRequests}
              className="inline-flex h-10 items-center gap-2 self-start rounded-lg border border-tf-surface bg-white px-4 text-sm font-semibold text-tf-primary hover:border-tf-primary"
            >
              <ArrowLeft className="size-4" aria-hidden /> Về danh sách yêu cầu
            </Link>
          </div>
        )}

        {request && (
          <>
            <header className="mt-5">
              <h1 className="text-2xl leading-tight font-bold tracking-[-0.02em] text-tf-ink sm:text-3xl">
                Yêu cầu nhận đồ <span className="text-tf-primary">{request.code}</span>
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-tf-ink-muted">
                <StatusTag domain="donation" status={request.status} />
                <span>Gửi lúc {formatDateTime(request.createdAt)}</span>
              </div>
            </header>

            <section aria-label="Tiến trình nhận đồ" className="mt-6">
              <DonationProgress request={request} perspective="receiver" />
            </section>

            <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <div className="flex min-w-0 flex-col gap-6">
                {(request.status === 'pending' || request.status === 'accepted') && (
                  <p className="flex items-start gap-3 rounded-xl border border-tf-surface bg-white p-4 text-sm leading-6 text-tf-ink">
                    <Clock className="mt-0.5 size-5 shrink-0 text-tf-primary" aria-hidden />
                    {request.status === 'pending'
                      ? `Yêu cầu đã được gửi tới ${donorName}. Bạn sẽ nhận thông báo khi người tặng đồng ý hoặc từ chối.`
                      : `${donorName} đã đồng ý tặng. Hãy liên hệ người tặng để thống nhất cách nhận đồ chơi.`}
                  </p>
                )}

                {request.status === 'shipping' && (
                  <ConfirmReceiptForm
                    donorName={donorName}
                    loading={actions.confirmReceived.isPending}
                    onSubmit={(input) => actions.confirmReceived.mutate(input)}
                  />
                )}

                {canCancel && (
                  <CancelDonationCard
                    perspective="receiver"
                    loading={actions.cancel.isPending}
                    onCancel={(note, onDone) => actions.cancel.mutate(note, { onSuccess: onDone })}
                  />
                )}

                <DonationToyCard toy={request.toy} />
                <DonationTimeline request={request} />
              </div>

              <aside className="flex flex-col gap-6 lg:sticky lg:top-20">
                <DonorContactCard request={request} />
              </aside>
            </div>
          </>
        )}
      </div>
    </SiteLayout>
  )
}
