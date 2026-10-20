import { BookOpen, Gift, HandHeart, MapPin, Phone, UserRound, Users, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useIsSignedIn } from '../../../hooks/use-is-signed-in'
import { PATHS } from '../../../routes/paths'
import type { PublicOrganization } from '../types'
import { AgeGroupChips } from './age-group-chips'
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
 * Số điện thoại chỉ có khi đã đăng nhập (backend không trả cho khách).
 */
export function OrganizationProfile({ organization }: { organization: PublicOrganization }) {
  const isSignedIn = useIsSignedIn()
  const location = useLocation()

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-4">
        <OrganizationLogo name={organization.name} logoUrl={organization.logoUrl} />
        <div className="min-w-0">
          <h2 className="text-lg leading-7 font-bold tracking-[-0.01em] text-tf-ink">{organization.name}</h2>
          {organization.province && <p className="text-sm text-tf-ink-muted">{organization.province}</p>}
        </div>
      </header>

      <ProfileSection icon={UserRound} title="Người phụ trách & liên hệ">
        <p className="text-sm leading-6 text-tf-ink">{organization.contactInfo}</p>
        {organization.phone ? (
          <a
            href={`tel:${organization.phone}`}
            className="inline-flex items-center gap-2 self-start rounded text-sm font-semibold text-tf-primary hover:underline"
          >
            <Phone className="size-4" aria-hidden /> {organization.phone}
          </a>
        ) : (
          !isSignedIn && (
            <p className="text-sm text-tf-ink-muted">
              <Link
                to={PATHS.login}
                state={{ from: location.pathname + location.search }}
                className="font-semibold text-tf-primary hover:underline"
              >
                Đăng nhập
              </Link>{' '}
              để xem số điện thoại liên hệ.
            </p>
          )
        )}
      </ProfileSection>

      {organization.description && (
        <ProfileSection icon={BookOpen} title="Câu chuyện & sứ mệnh">
          <p className="text-sm leading-6 whitespace-pre-line text-tf-ink-muted">{organization.description}</p>
        </ProfileSection>
      )}

      <ProfileSection icon={Users} title="Độ tuổi tiếp nhận">
        <AgeGroupChips ageGroups={organization.ageGroups} />
      </ProfileSection>

      <ProfileSection icon={HandHeart} title="Nhu cầu hiện tại">
        <p className="text-sm leading-6 whitespace-pre-line text-tf-ink">{organization.supportCriteria}</p>
      </ProfileSection>

      <ProfileSection icon={MapPin} title="Địa chỉ">
        <p className="text-sm leading-6 text-tf-ink">
          {[organization.address, organization.province].filter(Boolean).join(', ')}
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
