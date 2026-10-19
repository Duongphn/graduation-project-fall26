import { BadgeCheck, Eye, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'
import { charityOrganizationPath } from '../../../routes/paths'
import type { PublicOrganization } from '../types'
import { AgeGroupChips } from './age-group-chips'
import { OrganizationLogo } from './organization-logo'

interface OrganizationCardProps {
  organization: PublicOrganization
  isSelected: boolean
  /** Link mở hồ sơ ở khung bên phải (màn rộng), vd. "?id=…" giữ nguyên bộ lọc */
  selectHref: string
}

/** Thẻ tổ chức trong danh sách: địa điểm, độ tuổi tiếp nhận, nhu cầu */
export function OrganizationCard({ organization, isSelected, selectHref }: OrganizationCardProps) {
  const location = [organization.address, organization.province].filter(Boolean).join(', ')

  return (
    <article
      className={`rounded-xl border bg-white p-4 transition-[border-color,box-shadow] duration-200 ease-out-quint sm:p-5 ${
        isSelected ? 'border-tf-primary shadow-[0_0_0_1px_var(--color-tf-primary)]' : 'border-tf-surface hover:border-tf-outline'
      }`}
    >
      <div className="flex gap-4">
        <OrganizationLogo name={organization.name} logoUrl={organization.logoUrl} />

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="inline-flex items-center gap-1 self-start rounded-md bg-tf-secondary-container px-2 py-0.5 text-[11px] font-semibold text-tf-secondary">
            <BadgeCheck className="size-3.5" aria-hidden /> Được ToyFlow xác minh
          </p>
          <h3 className="text-base leading-6 font-bold tracking-[-0.01em] text-tf-ink">{organization.name}</h3>
          <p className="flex items-start gap-1.5 text-sm leading-5 text-tf-ink-muted">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="min-w-0">{location}</span>
          </p>
          <div className="flex flex-wrap items-center gap-2 text-sm text-tf-ink-muted">
            <span>Độ tuổi:</span>
            <AgeGroupChips ageGroups={organization.ageGroups} />
          </div>
          <p className="line-clamp-2 text-sm leading-6 text-tf-ink">
            <span className="font-semibold">Nhu cầu: </span>
            {organization.supportCriteria}
          </p>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        {/* Màn rộng: mở hồ sơ ở khung bên phải; màn hẹp: sang trang chi tiết */}
        <Link
          to={selectHref}
          aria-current={isSelected || undefined}
          className="hidden h-10 items-center gap-2 rounded-lg border border-tf-surface px-4 text-sm font-semibold text-tf-primary transition-colors hover:border-tf-primary lg:inline-flex"
        >
          <Eye className="size-4" aria-hidden /> {isSelected ? 'Đang xem hồ sơ' : 'Xem hồ sơ chi tiết'}
        </Link>
        <Link
          to={charityOrganizationPath(organization.id)}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-tf-surface px-4 text-sm font-semibold text-tf-primary transition-colors hover:border-tf-primary lg:hidden"
        >
          <Eye className="size-4" aria-hidden /> Xem hồ sơ chi tiết
        </Link>
      </div>
    </article>
  )
}

export function OrganizationCardSkeleton() {
  return (
    <div aria-hidden className="flex gap-4 rounded-xl border border-tf-surface bg-white p-5">
      <span className="size-14 shrink-0 animate-pulse rounded-lg bg-tf-surface" />
      <span className="flex flex-1 flex-col gap-2">
        <span className="h-4 w-2/3 animate-pulse rounded-md bg-tf-surface" />
        <span className="h-3 w-full animate-pulse rounded-md bg-tf-surface" />
        <span className="h-3 w-1/2 animate-pulse rounded-md bg-tf-surface" />
      </span>
    </div>
  )
}
