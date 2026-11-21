import { zodResolver } from '@hookform/resolvers/zod'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Form } from 'antd'
import { ChevronRight, CircleCheck, Home, ShieldAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useSearchParams } from 'react-router-dom'

import { ALL_PROVINCES, DonationReceiverSection } from '../features/donations/components/donation-receiver-section'
import { DonationPostSummary } from '../features/donations/components/donation-post-summary'
import { DonationSafetySection } from '../features/donations/components/donation-safety-section'
import { DonationToySection } from '../features/donations/components/donation-toy-section'
import { createDonationPost } from '../features/donations/donation-post-api'
import {
  AUTO_MATCH,
  allowedHandoverMethods,
  EMPTY_DONATION_POST,
  MIN_DONATION_PHOTOS,
  SAFETY_COMMITMENTS,
  donationPostSchema,
  findBannedTerms,
  isPhotoCountValid,
  type DonationPostValues,
} from '../features/donations/donation-post-schema'
import { handoverMethodValues } from '../features/donations/schemas'
import { useCategoryNames } from '../features/organizations/hooks'
import { organizationDetailQuery, organizationSuggestionsQuery } from '../features/organizations/public-queries'
import { profileQuery } from '../features/profile/profile-queries'
import { ListingPhotoUploader } from '../features/toy-listings/components/listing-photo-uploader'
import { useListingPhotos } from '../features/toy-listings/hooks/use-listing-photos'
import { CONTACT_DETAILS_MESSAGES } from '../features/toy-listings/contact-details'
import { getContactDetailsField, getListingErrorMessage } from '../features/toy-listings/toy-listing-api'
import { AGE_OPTIONS, MAX_IMAGES } from '../features/toy-listings/toy-listing-schema'
import { categoriesQuery, MY_LISTINGS_ROOT_KEY } from '../features/toy-listings/toy-listing-queries'
import { addressesQuery } from '../features/profile/profile-queries'
import { SiteLayout } from '../layouts/site/site-layout'
import { PATHS } from '../routes/paths'
import { getApiErrorCode } from '../services/http-client'

const NO_IMAGES: never[] = []

/** Lỗi ở ô Danh mục khi máy chủ báo danh mục vừa chọn đã bị ẩn hoặc xoá (CATEGORY_NOT_FOUND) */
const CATEGORY_GONE_ERROR = 'Danh mục vừa chọn không còn hoạt động, vui lòng chọn danh mục khác'

/** Donor tạo phiếu quyên góp: đồ chơi, ảnh, kiểm duyệt an toàn, tổ chức mong muốn, cách bàn giao (UC27) */
export function NewDonationPage() {
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  // ?organizationId=… khi bấm "Quyên góp cho tổ chức này" ở hồ sơ tổ chức
  const presetOrganizationId = searchParams.get('organizationId')
  const [photoError, setPhotoError] = useState<string>()
  const photos = useListingPhotos(NO_IMAGES)

  const { control, handleSubmit, setError, setValue } = useForm<DonationPostValues>({
    resolver: zodResolver(donationPostSchema),
    defaultValues: { ...EMPTY_DONATION_POST, receiver: presetOrganizationId ?? AUTO_MATCH },
  })
  const [title, description, categoryId, minAge, maxAge, condition, safety, receiver, handoverMethod] = useWatch({
    control,
    name: ['title', 'description', 'categoryId', 'minAge', 'maxAge', 'condition', 'safety', 'receiver', 'handoverMethod'],
  })

  const categories = useQuery(categoriesQuery)
  // GB-06 / MSG17: chỉ người đã xác minh danh tính mới quyên góp; chặn ngay khi mở form như form đăng tin.
  // Không tải được hồ sơ thì vẫn hiện form: backend vẫn chặn bằng USER_NOT_VERIFIED.
  const profileResult = useQuery(profileQuery)
  const mustVerify = profileResult.data !== undefined && profileResult.data.verificationStatus !== 'verified'
  const categoryNames = useCategoryNames()
  // GB-54: tổ chức gợi ý theo danh mục và độ tuổi của đồ chơi, tỉnh của địa chỉ mặc định đứng đầu
  const addresses = useQuery({ ...addressesQuery, retry: false })
  const donorProvince = addresses.data?.find((address) => address.isDefault)?.province
  const suggestionParams =
    categoryId && minAge !== undefined && maxAge !== undefined
      ? { categoryId, minAge, maxAge, ...(donorProvince ? { province: donorProvince } : {}) }
      : undefined
  const suggestions = useQuery({
    ...organizationSuggestionsQuery(suggestionParams ?? { categoryId: '', minAge: 0, maxAge: 0 }),
    enabled: Boolean(suggestionParams),
    placeholderData: keepPreviousData,
  })
  const suggested = suggestionParams ? suggestions.data : undefined
  // GB-52: lọc gợi ý theo tỉnh của điểm nhận
  const [province, setProvince] = useState(ALL_PROVINCES)
  const provinces = useMemo(
    () =>
      [...new Set((suggested ?? []).map((item) => item.receivingPoint?.province).filter(Boolean) as string[])].sort(
        (a, b) => a.localeCompare(b, 'vi'),
      ),
    [suggested],
  )
  const organizationOptions = useMemo(
    () =>
      suggested?.filter((item) => province === ALL_PROVINCES || item.receivingPoint?.province === province),
    [suggested, province],
  )
  // Tổ chức được chọn sẵn ("Quyên góp cho tổ chức này") chỉ giữ khi nó nhận đồ chơi này
  const presetOrganization = useQuery({
    ...organizationDetailQuery(presetOrganizationId ?? ''),
    enabled: Boolean(presetOrganizationId),
  })
  const suggestionsReady = Boolean(suggested) && !suggestions.isPlaceholderData
  useEffect(() => {
    if (!suggestionsReady || !receiver || receiver === AUTO_MATCH) return
    if (!suggested?.some((item) => item.id === receiver)) setValue('receiver', AUTO_MATCH)
  }, [suggestionsReady, suggested, receiver, setValue])
  const droppedOrganizationName =
    presetOrganizationId && suggestionsReady && !suggested?.some((item) => item.id === presetOrganizationId)
      ? (presetOrganization.data?.name ?? 'Tổ chức đã chọn')
      : null
  const chosenOrganization =
    receiver === AUTO_MATCH
      ? undefined
      : (suggested?.find((item) => item.id === receiver) ??
        (presetOrganization.data?.id === receiver ? presetOrganization.data : undefined))
  // GB-51: chỉ cách bàn giao mà điểm nhận của tổ chức đã chọn chấp nhận
  const allowedMethods = useMemo(() => allowedHandoverMethods(chosenOrganization), [chosenOrganization])
  useEffect(() => {
    const [onlyMethod] = allowedMethods
    if (handoverMethod && !allowedMethods.includes(handoverMethod) && onlyMethod) {
      setValue('handoverMethod', onlyMethod)
    }
  }, [allowedMethods, handoverMethod, setValue])

  const receiverName = chosenOrganization?.name ?? null
  const bannedTerms = findBannedTerms(title ?? '', description ?? '')
  const safetyChecked = Object.values(safety ?? {}).filter(Boolean).length
  const ageLabel = AGE_OPTIONS.find((option) => option.minAge === minAge && option.maxAge === maxAge)?.label

  const create = useMutation({
    mutationFn: createDonationPost,
    onError: (error) => {
      // Admin vừa ẩn/xoá danh mục đã chọn (kể cả trong lúc tải ảnh lên): tải lại danh sách để ô
      // chọn không còn danh mục đó, và bỏ chọn nó để lần gửi sau không gửi lại đúng danh mục ấy.
      if (getApiErrorCode(error) === 'CATEGORY_NOT_FOUND') {
        setValue('categoryId', '')
        setError('categoryId', { type: 'server', message: CATEGORY_GONE_ERROR })
        void queryClient.invalidateQueries({ queryKey: categoriesQuery.queryKey })
      }
      // MSG51 (UC33 4.1): tổ chức vừa ngừng nhận hoặc bị ẩn: tải lại danh sách để chọn tổ chức khác
      const code = getApiErrorCode(error)
      if (
        code === 'ORGANIZATION_NOT_ACCEPTING' ||
        code === 'ORGANIZATION_NOT_AVAILABLE' ||
        code === 'ORGANIZATION_NOT_FOUND' ||
        code === 'ORGANIZATION_NO_RECEIVING_POINT'
      ) {
        void queryClient.invalidateQueries({ queryKey: ['public-organizations'] })
      }
      // GB-11: tên hoặc mô tả có số điện thoại, email hoặc đường link: báo ngay dưới ô đó
      const contactField = getContactDetailsField(error)
      if (contactField) {
        setError(contactField, { type: 'server', message: CONTACT_DETAILS_MESSAGES[contactField] }, { shouldFocus: true })
      }
    },
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
      const organizationId = values.receiver === AUTO_MATCH ? undefined : values.receiver
      create.mutate({
        title: values.title,
        categoryId: values.categoryId,
        condition: values.condition,
        minAge: values.minAge,
        maxAge: values.maxAge,
        description: values.description,
        images: photos.newFiles,
        // UC33 bước 4–5: tổ chức và cách bàn giao lưu cùng tin; Admin duyệt tin thì yêu cầu được tạo
        ...(organizationId
          ? { organizationId, handoverMethod: handoverMethodValues[values.handoverMethod] }
          : {}),
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
              “{create.data.title}” đang chờ Admin kiểm duyệt an toàn.{' '}
              {create.data.donationTarget
                ? `Khi được duyệt, yêu cầu quyên góp tới ${receiverName ?? 'tổ chức đã chọn'} được tạo và hiện trong mục Quyên góp của tôi.`
                : 'Khi được duyệt, tin mở để tổ chức hoặc người khác xin nhận; các yêu cầu hiện trong mục Quyên góp của tôi.'}
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

  if (mustVerify) {
    return (
      <SiteLayout>
        <div className="home-container py-10">
          <section
            role="alert"
            className="mx-auto flex max-w-xl flex-col items-center gap-3 rounded-xl border border-tf-surface bg-white p-8 text-center dark:border-night-700 dark:bg-night-900"
          >
            <ShieldAlert className="size-12 text-tf-tertiary" aria-hidden />
            <h1 className="text-2xl font-bold text-tf-ink dark:text-slate-100">Tạo phiếu quyên góp</h1>
            <p className="text-sm leading-6 text-tf-ink-muted dark:text-slate-300">Vui lòng xác minh danh tính trước khi tiếp tục.</p>
            <Link
              to={PATHS.identityVerification}
              className="mt-2 inline-flex h-10 items-center rounded-full bg-tf-primary px-5 text-sm font-bold text-white"
            >
              Xác minh danh tính
            </Link>
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
              organizationsLoading={Boolean(suggestionParams) && suggestions.isPending}
              province={province}
              provinces={provinces}
              onProvinceChange={setProvince}
              categoryNames={categoryNames}
              droppedOrganizationName={droppedOrganizationName}
              allowedMethods={allowedMethods}
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
