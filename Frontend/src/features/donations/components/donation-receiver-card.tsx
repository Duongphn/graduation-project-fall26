import { useQuery } from '@tanstack/react-query'
import { BadgeCheck, MapPin, Phone, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'

import { OrganizationLogo } from '../../organizations/components/organization-logo'
import { organizationDetailQuery } from '../../organizations/public-queries'
import { charityOrganizationPath } from '../../../routes/paths'
import type { DonationRequestDetail } from '../types'

/**
 * Bên nhận đồ chơi: tổ chức (hồ sơ công khai GET /organizations/:id) hoặc người dùng.
 * Số điện thoại đầy đủ chỉ có khi phiếu đang ACCEPTED/SHIPPING (counterpartContact, D-03).
 */
export function DonationReceiverCard({ request }: { request: DonationRequestDetail }) {
  const organizationId = request.organization?.id
  const organization = useQuery({ ...organizationDetailQuery(organizationId ?? ''), enabled: Boolean(organizationId) })
  const profile = organization.data
  const name = profile?.name ?? request.organization?.name ?? request.requester?.fullName ?? 'Bên nhận'
  const contact = request.counterpartContact

  return (
    <section aria-labelledby="receiver-title" className="rounded-xl border border-tf-surface bg-white p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 id="receiver-title" className="text-xs font-bold tracking-[0.06em] text-tf-ink-muted uppercase">
          {request.receiverType === 'ORGANIZATION' ? 'Tổ chức tiếp nhận' : 'Người nhận'}
        </h2>
        {request.receiverType === 'ORGANIZATION' && (
          <span className="inline-flex items-center gap-1 rounded-md bg-tf-secondary-container px-2 py-0.5 text-[11px] font-semibold text-tf-secondary">
            <BadgeCheck className="size-3.5" aria-hidden /> Đã xác minh
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center gap-3">
        {request.receiverType === 'ORGANIZATION' ? (
          <OrganizationLogo name={name} logoUrl={profile?.logoUrl ?? null} />
        ) : request.requester?.avatarUrl ? (
          <img src={request.requester.avatarUrl} alt="" className="size-14 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="grid size-14 shrink-0 place-items-center rounded-full bg-tf-primary-fixed text-tf-primary">
            <UserRound className="size-6" aria-hidden />
          </span>
        )}
        <p className="min-w-0 text-base leading-6 font-bold text-tf-ink">{name}</p>
      </div>

      <dl className="mt-4 flex flex-col gap-3 border-t border-tf-surface pt-4 text-sm leading-6">
        {profile && (
          <div className="flex gap-2">
            <MapPin className="mt-1 size-4 shrink-0 text-tf-ink-muted" aria-hidden />
            <div>
              <dt className="font-semibold text-tf-ink">Địa chỉ nhận hàng</dt>
              <dd className="text-tf-ink-muted">{[profile.address, profile.province].filter(Boolean).join(', ')}</dd>
            </div>
          </div>
        )}
        {profile?.contactInfo && (
          <div className="flex gap-2">
            <UserRound className="mt-1 size-4 shrink-0 text-tf-ink-muted" aria-hidden />
            <div>
              <dt className="font-semibold text-tf-ink">Người tiếp nhận</dt>
              <dd className="text-tf-ink-muted">{profile.contactInfo}</dd>
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <Phone className="mt-1 size-4 shrink-0 text-tf-ink-muted" aria-hidden />
          <div>
            <dt className="font-semibold text-tf-ink">Số điện thoại</dt>
            <dd className="text-tf-ink-muted">
              {contact?.phone ? (
                <a href={`tel:${contact.phone}`} className="font-semibold text-tf-primary hover:underline">
                  {contact.phone}
                </a>
              ) : request.status === 'PENDING' ? (
                'Hiển thị sau khi bạn đồng ý tặng'
              ) : (
                'Không hiển thị'
              )}
            </dd>
          </div>
        </div>
      </dl>

      {organizationId && (
        <Link
          to={charityOrganizationPath(organizationId)}
          className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-lg border border-tf-surface text-sm font-semibold text-tf-primary hover:border-tf-primary"
        >
          Xem hồ sơ tổ chức
        </Link>
      )}
    </section>
  )
}
