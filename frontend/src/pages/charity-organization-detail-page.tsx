import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ChevronRight, Home } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { QueryErrorAlert } from '../components/common'
import { OrganizationProfile } from '../features/organizations/components/organization-profile'
import { organizationDetailQuery } from '../features/organizations/public-queries'
import { SiteLayout } from '../layouts/site/site-layout'
import { PATHS } from '../routes/paths'

/** Hồ sơ một tổ chức từ thiện — dùng trên màn hẹp (màn rộng xem ở khung bên phải trang danh sách) */
export function CharityOrganizationDetailPage() {
  const { organizationId = '' } = useParams()
  const detail = useQuery(organizationDetailQuery(organizationId))
  const organization = detail.data

  useEffect(() => {
    document.title = `${organization?.name ?? 'Tổ chức từ thiện'} | ToyFlow`
  }, [organization?.name])

  return (
    <SiteLayout>
      <div className="home-container py-6 sm:py-8">
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-xs text-tf-ink-muted">
          <Link to={PATHS.home} className="inline-flex shrink-0 items-center gap-1 hover:text-tf-primary">
            <Home className="size-3.5" aria-hidden /> Trang chủ
          </Link>
          <ChevronRight className="size-3.5 shrink-0" aria-hidden />
          <Link to={PATHS.charityOrganizations} className="shrink-0 hover:text-tf-primary">
            Tổ chức từ thiện
          </Link>
          {organization && (
            <>
              <ChevronRight className="size-3.5 shrink-0" aria-hidden />
              <span aria-current="page" className="truncate font-medium text-tf-ink">
                {organization.name}
              </span>
            </>
          )}
        </nav>

        <div className="mx-auto mt-5 max-w-3xl">
          {detail.isPending && (
            <div aria-hidden className="flex flex-col gap-3 rounded-xl border border-tf-surface bg-white p-5">
              <span className="size-14 animate-pulse rounded-lg bg-tf-surface" />
              <span className="h-5 w-2/3 animate-pulse rounded-md bg-tf-surface" />
              <span className="h-3 w-full animate-pulse rounded-md bg-tf-surface" />
              <span className="h-3 w-1/2 animate-pulse rounded-md bg-tf-surface" />
            </div>
          )}

          {detail.isError && (
            <div className="flex flex-col gap-4">
              <QueryErrorAlert error={detail.error} onRetry={() => void detail.refetch()} />
              <Link
                to={PATHS.charityOrganizations}
                className="inline-flex h-10 items-center gap-2 self-start rounded-lg border border-tf-surface bg-white px-4 text-sm font-semibold text-tf-primary hover:border-tf-primary"
              >
                <ArrowLeft className="size-4" aria-hidden /> Về danh sách tổ chức
              </Link>
            </div>
          )}

          {organization && (
            <article className="rounded-xl border border-tf-surface bg-white p-5 sm:p-6">
              <OrganizationProfile organization={organization} />
            </article>
          )}
        </div>
      </div>
    </SiteLayout>
  )
}
