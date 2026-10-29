import { zodResolver } from '@hookform/resolvers/zod'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Form } from 'antd'
import { ChevronRight, CircleCheck, Home } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useSearchParams } from 'react-router-dom'

import { DonationReceiverSection } from '../features/donations/components/donation-receiver-section'
import { DonationPostSummary } from '../features/donations/components/donation-post-summary'
import { DonationSafetySection } from '../features/donations/components/donation-safety-section'
import { DonationToySection } from '../features/donations/components/donation-toy-section'
import { createDonationPost } from '../features/donations/donation-post-api'
import {
  AUTO_MATCH,
  EMPTY_DONATION_POST,
  MIN_DONATION_PHOTOS,
  SAFETY_COMMITMENTS,
  composeDonationDescription,
  donationPostSchema,
  findBannedTerms,
  isPhotoCountValid,
  type DonationPostValues,
} from '../features/donations/donation-post-schema'
import { organizationDetailQuery, organizationListQuery } from '../features/organizations/public-queries'
import type { PublicOrganization } from '../features/organizations/types'
import { ListingPhotoUploader } from '../features/toy-listings/components/listing-photo-uploader'
import { useListingPhotos } from '../features/toy-listings/hooks/use-listing-photos'
import { getListingErrorMessage } from '../features/toy-listings/toy-listing-api'
import { AGE_OPTIONS, MAX_IMAGES } from '../features/toy-listings/toy-listing-schema'
import { categoriesQuery, MY_LISTINGS_ROOT_KEY } from '../features/toy-listings/toy-listing-queries'
import { SiteLayout } from '../layouts/site/site-layout'
import { PATHS } from '../routes/paths'
import { getApiErrorCode } from '../services/http-client'

const NO_IMAGES: never[] = []

/** Donor tạo phiếu quyên góp: đồ chơi, ảnh, kiểm duyệt an toàn, tổ chức mong muốn, cách bàn giao (UC27) */
export function NewDonationPage() {
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  // ?organizationId=… khi bấm "Quyên góp cho tổ chức này" ở hồ sơ tổ chức
  const presetOrganizationId = searchParams.get('organizationId')
  const [photoError, setPhotoError] = useState<string>()
  const photos = useListingPhotos(NO_IMAGES)

  const { control, handleSubmit, setValue } = useForm<DonationPostValues>({
    resolver: zodResolver(donationPostSchema),
    defaultValues: { ...EMPTY_DONATION_POST, receiver: presetOrganizationId ?? AUTO_MATCH },
  })
  const [title, description, minAge, maxAge, condition, safety, receiver, handoverMethod] = useWatch({
    control,
    name: ['title', 'description', 'minAge', 'maxAge', 'condition', 'safety', 'receiver', 'handoverMethod'],
  })

  const categories = useQuery(categoriesQuery)
  // Ô tìm tổ chức: chờ người dùng ngừng gõ 300ms mới gọi API
  const [orgKeyword, setOrgKeyword] = useState('')
  const [orgQuery, setOrgQuery] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setOrgQuery(orgKeyword.trim()), 300)
    return () => clearTimeout(timer)
  }, [orgKeyword])
  const organizations = useQuery({
    ...organizationListQuery({ page: 1, ...(orgQuery ? { q: orgQuery } : {}) }),
    placeholderData: keepPreviousData,
  })
  // Tổ chức đã chọn vẫn hiện khi người dùng tìm tên khác: lấy lại từ các trang đã tải trong cache
  const chosenOrganization = useMemo(() => {
    if (!receiver || receiver === AUTO_MATCH) return undefined
    const inCurrentPage = organizations.data?.items.find((item) => item.id === receiver)
    if (inCurrentPage) return inCurrentPage
    const pages = queryClient.getQueriesData<{ items: PublicOrganization[] }>({
      queryKey: ['public-organizations', 'list'],
    })
    for (const [, page] of pages) {
      const found = page?.items.find((item) => item.id === receiver)
      if (found) return found
    }
    return undefined
  }, [queryClient, receiver, organizations.data])
  // Tổ chức được chọn sẵn có thể không nằm ở trang đầu danh sách: tải riêng để vẫn hiện
  const presetOrganization = useQuery({
    ...organizationDetailQuery(presetOrganizationId ?? ''),
    enabled: Boolean(presetOrganizationId),
  })
  const organizationOptions = useMemo(() => {
    const items = organizations.data?.items ?? []
    const pinned = [chosenOrganization, presetOrganization.data].filter(
      (item): item is PublicOrganization => Boolean(item) && item?.id === receiver,
    )
    const extra = pinned.filter((item, index) => pinned.findIndex((other) => other.id === item.id) === index)
    return [...extra.filter((item) => !items.some((other) => other.id === item.id)), ...items]
  }, [organizations.data, presetOrganization.data, chosenOrganization, receiver])

  const receiverName =
    receiver === AUTO_MATCH ? null : (organizationOptions.find((item) => item.id === receiver)?.name ?? null)
  const bannedTerms = findBannedTerms(title ?? '', description ?? '')
  const safetyChecked = Object.values(safety ?? {}).filter(Boolean).length
  const ageLabel = AGE_OPTIONS.find((option) => option.minAge === minAge && option.maxAge === maxAge)?.label

  const create = useMutation({
    mutationFn: createDonationPost,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: MY_LISTINGS_ROOT_KEY }),
  })

  useEffect(() => {
    document.title = 'Tạo phiếu quyên góp | ToyFlow'
  }, [])

  const checkPhotos = () => {
    const ok = isPhotoCountValid(photos.photos.length)
    setPhotoError(ok ? undefined : `Cần từ ${MIN_DONATION_PHOTOS} đến ${MAX_IMAGES} ảnh chụp thực tế.`)
    return ok
  }

  const submit = handleSubmit(
    (values) => {
      if (!checkPhotos()) return
      create.mutate({
        title: values.title,
        categoryId: values.categoryId,
        condition: values.condition,
        minAge: values.minAge,
        maxAge: values.maxAge,
        description: composeDonationDescription(values.description, values.handoverMethod, receiverName),
        images: photos.newFiles,
      })
    },
    () => void checkPhotos(),
  )

  if (create.isSuccess) {
    return (
      <SiteLayout>
        <div className="home-container py-10">
          <section className="mx-auto flex max-w-xl flex-col items-center gap-3 rounded-xl border border-tf-surface bg-white p-8 text-center">
            <CircleCheck className="size-12 text-tf-secondary" aria-hidden />
            <h1 className="text-2xl font-bold text-tf-ink">Đã gửi phiếu quyên góp</h1>
            <p className="text-sm leading-6 text-tf-ink-muted">
              “{create.data.title}” đang chờ Admin kiểm duyệt an toàn. Khi được duyệt, tổ chức sẽ gửi yêu cầu nhận và
              phiếu hiện trong mục Quyên góp của tôi.
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-3">
              <Link
                to={PATHS.myDonations}
                className="inline-flex h-10 items-center rounded-full bg-tf-primary px-5 text-sm font-bold text-white"
              >
                Quyên góp của tôi
              </Link>
              <Link
                to={PATHS.myListings}
                className="inline-flex h-10 items-center rounded-full border border-tf-surface px-5 text-sm font-semibold text-tf-primary"
              >
                Xem trong Tin đăng của tôi
              </Link>
            </div>
          </section>
        </div>
      </SiteLayout>
    )
  }

  const errorCode = create.error ? getApiErrorCode(create.error) : undefined

  return (
    <SiteLayout>
      <div className="home-container py-6 sm:py-8">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-tf-ink-muted">
          <Link to={PATHS.home} className="inline-flex items-center gap-1 hover:text-tf-primary">
            <Home className="size-3.5" aria-hidden /> Trang chủ
          </Link>
          <ChevronRight className="size-3.5" aria-hidden />
          <Link to={PATHS.myDonations} className="hover:text-tf-primary">
            Quyên góp của tôi
          </Link>
          <ChevronRight className="size-3.5" aria-hidden />
          <span aria-current="page" className="font-medium text-tf-ink">
            Tạo phiếu quyên góp
          </span>
        </nav>

        <header className="mt-5 max-w-3xl">
          <h1 className="text-2xl leading-tight font-bold tracking-[-0.02em] text-tf-ink sm:text-3xl">
            Tạo phiếu quyên góp & kiểm duyệt an toàn
          </h1>
          <p className="mt-2 text-[15px] leading-7 text-tf-ink-muted">
            Mỗi món đồ trao đi trọn vẹn yêu thương và cam kết an toàn tuyệt đối. Đồ chơi được kiểm tra nghiêm ngặt trước
            khi chuyển tới các mái ấm.
          </p>
        </header>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Form layout="vertical" component="div" disabled={create.isPending} className="flex min-w-0 flex-col gap-6">
            <DonationToySection
              control={control}
              setValue={setValue}
              categories={categories.data ?? []}
              categoriesLoading={categories.isPending}
            />
            <ListingPhotoUploader
              photos={photos.photos}
              rejections={photos.rejections}
              requiredError={photoError}
              canReorder
              disabled={create.isPending}
              onAddFiles={(files) => {
                photos.addFiles(files)
                setPhotoError(undefined)
              }}
              onRemove={photos.removePhoto}
              onMakeCover={photos.makeCover}
            />
            <DonationSafetySection control={control} checkedCount={safetyChecked} bannedTerms={bannedTerms} />
            <DonationReceiverSection
              control={control}
              organizations={organizationOptions}
              organizationsLoading={organizations.isPending}
              keyword={orgKeyword}
              onKeywordChange={setOrgKeyword}
              total={organizations.data?.pagination.totalItems}
            />
          </Form>

          <DonationPostSummary
            title={title ?? ''}
            coverUrl={photos.photos[0]?.url}
            ageLabel={ageLabel}
            condition={condition ?? ''}
            receiverName={receiverName ?? 'Để ToyFlow ghép'}
            handoverMethod={handoverMethod ?? 'CARRIER'}
            safetyChecked={safetyChecked}
            safetyTotal={SAFETY_COMMITMENTS.length}
            blocked={bannedTerms.length > 0}
            submitting={create.isPending}
            error={
              create.error
                ? errorCode === 'USER_NOT_VERIFIED'
                  ? 'Bạn cần xác thực danh tính (CCCD) trước khi quyên góp. Vào Hồ sơ của tôi → Xác minh danh tính.'
                  : getListingErrorMessage(create.error)
                : null
            }
            onSubmit={() => void submit()}
          />
        </div>
      </div>
    </SiteLayout>
  )
}
