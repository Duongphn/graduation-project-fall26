import { Gift, HandHeart, MapPin, UserRound, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PATHS } from '../../../routes/paths'
import type { PublicOrganization } from '../types'
import { OrganizationLogo } from './organization-logo'

function ProfileSection({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-tf-surface pt-4">
      <h3 className="flex items-center gap-2 text-xs font-bold tracking-[0.06em] text-tf-ink uppercase">
        <Icon className="size-4 text-tf-accent" aria-hidden /> {title}
      </h3>
      {children}
    </section>
  )
}

/**
 * Hồ sơ đầy đủ của một tổ chức — dùng ở khung bên phải trang danh sách và ở trang chi tiết.
 */
export function OrganizationProfile({ organization }: { organization: PublicOrganization }) {
  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-4">
        <OrganizationLogo name={organization.name} />
        <div className="min-w-0">
          <h2 className="text-lg leading-7 font-bold tracking-[-0.01em] text-tf-ink">{organization.name}</h2>
        </div>
      </header>

      <ProfileSection icon={UserRound} title="Người phụ trách & liên hệ">
        <p className="text-sm leading-6 text-tf-ink">{organization.contactInfo}</p>
      </ProfileSection>

      <ProfileSection icon={HandHeart} title="Nhu cầu hiện tại">
        <p className="text-sm leading-6 whitespace-pre-line text-tf-ink">{organization.supportCriteria}</p>
      </ProfileSection>

      <ProfileSection icon={MapPin} title="Địa chỉ">
        <p className="text-sm leading-6 text-tf-ink">
          {organization.address}
        </p>
      </ProfileSection>

      <Link
        to={`${PATHS.newDonation}?organizationId=${organization.id}`}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-tf-primary px-5 text-sm font-bold text-white transition-colors hover:bg-tf-primary-container"
      >
        <Gift className="size-4" aria-hidden /> Quyên góp cho tổ chức này
      </Link>
    </div>
  )
}
