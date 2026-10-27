import { Phone, UserRound } from 'lucide-react'

import type { DonationRequestDetail } from '../types'

/**
 * Người tặng, xem từ phía bên nhận. Họ tên và số điện thoại đầy đủ chỉ có khi yêu cầu đang
 * ACCEPTED/SHIPPING (counterpartContact, D-03); các trạng thái khác chỉ hiện tên công khai.
 */
export function DonorContactCard({ request }: { request: DonationRequestDetail }) {
  const contact = request.counterpartContact
  const name = contact?.name ?? request.donor?.fullName ?? 'Người tặng'

  return (
    <section aria-labelledby="donor-title" className="rounded-xl border border-tf-surface bg-white p-5">
      <h2 id="donor-title" className="text-xs font-bold tracking-[0.06em] text-tf-ink-muted uppercase">
        Người tặng
      </h2>
      <div className="mt-3 flex items-center gap-3">
        {request.donor?.avatarUrl ? (
          <img src={request.donor.avatarUrl} alt="" className="size-14 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="grid size-14 shrink-0 place-items-center rounded-full bg-tf-primary-fixed text-tf-primary">
            <UserRound className="size-6" aria-hidden />
          </span>
        )}
        <p className="min-w-0 text-base leading-6 font-bold text-tf-ink">{name}</p>
      </div>
      <dl className="mt-4 flex flex-col gap-3 border-t border-tf-surface pt-4 text-sm leading-6">
        <div className="flex gap-2">
          <Phone className="mt-1 size-4 shrink-0 text-tf-ink-muted" aria-hidden />
          <div>
            <dt className="font-semibold text-tf-ink">Số điện thoại</dt>
            <dd className="text-tf-ink-muted">
              {contact?.phone ? (
                <a href={`tel:${contact.phone}`} className="font-semibold text-tf-primary hover:underline">
                  {contact.phone}
                </a>
              ) : request.status === 'pending' ? (
                'Hiển thị sau khi người tặng đồng ý'
              ) : (
                'Không hiển thị'
              )}
            </dd>
          </div>
        </div>
      </dl>
    </section>
  )
}
