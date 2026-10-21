import { ArrowRight, Building2, CalendarCheck, ImageOff, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'

import { StatusTag } from '../../../components/common'
import { formatAgeRange } from '../../../utils/format'
import { myDonationPath } from '../../../routes/paths'
import { formatDateTime } from '../format'
import type { DonationRequest } from '../types'

/** Một lượt quyên góp đã được bên nhận xác nhận (COMPLETED) trong lịch sử của người tặng */
export function CompletedDonationCard({ request }: { request: DonationRequest }) {
  const { toy, organization } = request
  const receiver = organization?.name ?? request.requester?.fullName ?? 'Bên nhận'
  const ReceiverIcon = organization ? Building2 : UserRound

  return (
    <article className="rounded-xl border border-tf-surface bg-white">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-tf-surface px-5 py-3">
        <h3 className="text-base font-bold text-tf-primary">{request.code}</h3>
        <span className="flex items-center gap-1 text-sm text-tf-ink-muted">
          <CalendarCheck className="size-4" aria-hidden />
          Hoàn tất {formatDateTime(request.completedAt ?? request.updatedAt)}
        </span>
        <StatusTag domain="donation" status={request.status} />
      </header>

      <div className="flex flex-col gap-4 p-5 sm:flex-row">
        {toy?.imageUrl ? (
          <img
            src={toy.imageUrl}
            alt={toy.title}
            loading="lazy"
            className="aspect-[4/3] w-full rounded-lg object-cover sm:w-40"
          />
        ) : (
          <span className="grid aspect-[4/3] w-full place-items-center rounded-lg bg-tf-page text-tf-ink-muted sm:w-40">
            <ImageOff className="size-6" aria-hidden />
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-tf-secondary">
            <ReceiverIcon className="size-3.5" aria-hidden /> {receiver}
          </p>
          <p className="text-base leading-6 font-semibold text-tf-ink">{toy?.title ?? 'Đồ chơi không còn tồn tại'}</p>
          {toy && (
            <ul className="flex flex-wrap gap-1.5 text-xs">
              <li className="rounded-md bg-tf-page px-2 py-0.5 text-tf-ink-muted">{toy.condition}</li>
              <li className="rounded-md bg-tf-page px-2 py-0.5 text-tf-ink-muted">{formatAgeRange(toy.ageRange)}</li>
            </ul>
          )}
          <Link
            to={myDonationPath(request.id)}
            className="mt-auto inline-flex items-center gap-1 self-start text-sm font-semibold text-tf-primary hover:underline"
          >
            Chi tiết hành trình <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>
    </article>
  )
}
