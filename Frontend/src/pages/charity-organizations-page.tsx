import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Input, Pagination } from 'antd'
import { Building2, ChevronRight, Home, Search } from 'lucide-react'
import { useEffect, useMemo, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ProvinceSelect, QueryErrorAlert } from '../components/common'
import { ageGroups } from '../constants/domain'
import { ageGroupLabels } from '../constants/labels'
import { OrganizationCard, OrganizationCardSkeleton } from '../features/organizations/components/organization-card'
import { OrganizationProfile } from '../features/organizations/components/organization-profile'
import {
  ORGANIZATION_PAGE_SIZE,
  organizationListQuery,
  parseOrganizationSearch,
  toOrganizationSearch,
  type OrganizationFilters,
} from '../features/organizations/public-queries'
import { SiteLayout } from '../layouts/site/site-layout'
import { PATHS } from '../routes/paths'

const countFormatter = new Intl.NumberFormat('vi-VN')

const chipClass = (active: boolean) =>
  `inline-flex h-8 items-center rounded-lg border px-3 text-sm font-medium transition-colors ${
    active
      ? 'border-tf-primary bg-tf-primary text-white'
      : 'border-tf-surface bg-white text-tf-ink-muted hover:border-tf-primary hover:text-tf-primary'
  }`

/** Donor xem tổ chức từ thiện đã được Admin xác minh: địa điểm, nhu cầu, độ tuổi tiếp nhận (UC27) */
export function CharityOrganizationsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = useMemo(() => parseOrganizationSearch(searchParams), [searchParams])
  const selectedId = searchParams.get('id')
  // Giữ danh sách cũ trên màn hình trong lúc tải bộ lọc mới, tránh chớp trống
  const list = useQuery({ ...organizationListQuery(filters), placeholderData: keepPreviousData })

  useEffect(() => {
    document.title = 'Tổ chức từ thiện | ToyFlow'
  }, [])

  /** Mọi thay đổi bộ lọc đưa về trang 1 và bỏ tổ chức đang chọn */
  const updateFilters = (patch: Partial<OrganizationFilters>) =>
    setSearchParams(toOrganizationSearch({ ...filters, ...patch, page: 1 }))

  const submitKeyword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const keyword = String(new FormData(event.currentTarget).get('q') ?? '').trim()
    updateFilters({ q: keyword || undefined })
  }

  const selectHref = (organizationId: string) => {
    const params = toOrganizationSearch(filters)
    params.set('id', organizationId)
    return `?${params}`
  }

  const items = list.data?.items ?? []
  const total = list.data?.pagination.totalItems
  // Khung bên phải: tổ chức đang chọn trên URL, mặc định tổ chức đầu tiên của trang
  const selected = items.find((item) => item.id === selectedId) ?? items[0]

  return (
    <SiteLayout>
      <div className="home-container py-6 sm:py-8">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-tf-ink-muted">
          <Link to={PATHS.home} className="inline-flex items-center gap-1 hover:text-tf-primary">
            <Home className="size-3.5" aria-hidden /> Trang chủ
          </Link>
          <ChevronRight className="size-3.5" aria-hidden />
          <span aria-current="page" className="font-medium text-tf-ink">
            Tổ chức từ thiện
          </span>
        </nav>

        <header className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-3xl leading-tight font-bold tracking-[-0.02em] text-tf-ink sm:text-4xl">
              Tổ chức từ thiện & mái ấm tiếp nhận đồ chơi
            </h1>
            <p className="mt-3 text-[15px] leading-7 text-tf-ink-muted">
              Mái ấm, trường tình thương và tổ chức đã được ToyFlow xác minh. Xem họ ở đâu, đang cần đồ chơi gì
              và tiếp nhận cho trẻ ở độ tuổi nào trước khi quyên góp.
            </p>
          </div>
          <p className="flex items-center gap-3 self-start rounded-xl border border-tf-surface bg-white px-4 py-3 lg:self-auto">
            <span className="grid size-10 place-items-center rounded-lg bg-tf-primary-fixed text-tf-primary">
              <Building2 className="size-5" aria-hidden />
            </span>
            <span>
              <span className="block text-xl leading-6 font-bold text-tf-ink tabular-nums">
                {total === undefined ? '…' : countFormatter.format(total)}
              </span>
              <span className="text-xs text-tf-ink-muted">tổ chức phù hợp bộ lọc</span>
            </span>
          </p>
        </header>

        {/* Bộ lọc: từ khoá, tỉnh/thành, độ tuổi tiếp nhận — đều là tham số của GET /organizations */}
        <section aria-label="Lọc tổ chức" className="mt-6 flex flex-col gap-3 rounded-xl border border-tf-surface bg-white p-4">
          <div className="flex flex-col gap-3 md:flex-row">
            <form role="search" onSubmit={submitKeyword} className="min-w-0 flex-1" key={filters.q ?? ''}>
              <Input
                name="q"
                size="large"
                allowClear
                defaultValue={filters.q}
                maxLength={100}
                prefix={<Search className="size-4 text-tf-ink-muted" aria-hidden />}
                placeholder="Tìm theo tên tổ chức, ví dụ: Mái ấm Hoa Hồng"
                aria-label="Tìm tổ chức theo tên"
              />
            </form>
            <ProvinceSelect
              size="large"
              allowClear
              value={filters.province}
              onChange={(province) => updateFilters({ province: province ?? undefined })}
              placeholder="Tất cả tỉnh/thành"
              className="w-full md:w-64"
              aria-label="Lọc theo tỉnh/thành"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-tf-ink-muted">Độ tuổi:</span>
            <button type="button" className={chipClass(!filters.ageGroup)} onClick={() => updateFilters({ ageGroup: undefined })} aria-pressed={!filters.ageGroup}>
              Tất cả
            </button>
            {ageGroups.map((group) => (
              <button
                key={group}
                type="button"
                className={chipClass(filters.ageGroup === group)}
                onClick={() => updateFilters({ ageGroup: group })}
                aria-pressed={filters.ageGroup === group}
              >
                {ageGroupLabels[group]}
              </button>
            ))}
          </div>
        </section>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <section aria-labelledby="org-list-title" className="flex min-w-0 flex-col gap-4">
            <h2 id="org-list-title" className="text-lg font-bold text-tf-ink">
              Danh sách tổ chức
            </h2>

            {list.isPending && Array.from({ length: 3 }, (_, index) => <OrganizationCardSkeleton key={index} />)}

            {list.isError && !list.data && <QueryErrorAlert error={list.error} onRetry={() => void list.refetch()} />}

            {list.isSuccess && items.length === 0 && (
              <div className="rounded-xl border border-dashed border-tf-outline bg-white px-6 py-10 text-center">
                <p className="font-semibold text-tf-ink">Không có tổ chức nào phù hợp.</p>
                <p className="mt-1 text-sm text-tf-ink-muted">Thử bỏ bớt bộ lọc tỉnh/thành hoặc độ tuổi.</p>
                <button
                  type="button"
                  onClick={() => setSearchParams(new URLSearchParams())}
                  className="mt-4 inline-flex h-10 items-center rounded-lg border border-tf-surface px-4 text-sm font-semibold text-tf-primary hover:border-tf-primary"
                >
                  Xoá bộ lọc
                </button>
              </div>
            )}

            {items.map((organization) => (
              <OrganizationCard
                key={organization.id}
                organization={organization}
                isSelected={organization.id === selected?.id}
                selectHref={selectHref(organization.id)}
              />
            ))}

            {total !== undefined && total > ORGANIZATION_PAGE_SIZE && (
              <Pagination
                className="self-center"
                current={filters.page}
                pageSize={ORGANIZATION_PAGE_SIZE}
                total={total}
                showSizeChanger={false}
                onChange={(page) => setSearchParams(toOrganizationSearch({ ...filters, page }))}
              />
            )}
          </section>

          {/* Khung hồ sơ chỉ có trên màn rộng; màn hẹp bấm thẻ để sang trang chi tiết */}
          {selected && (
            <aside
              aria-label={`Hồ sơ ${selected.name}`}
              className="sticky top-20 hidden rounded-xl border border-tf-surface bg-white p-5 lg:block"
            >
              <OrganizationProfile organization={selected} />
            </aside>
          )}
        </div>
      </div>
    </SiteLayout>
  )
}
