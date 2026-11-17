import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { FormProvider, useForm, useWatch } from 'react-hook-form'
import { Link, useLocation } from 'react-router-dom'
import { ListingDetailsSection } from './listing-details-section'
import { ListingPhotoUploader } from './listing-photo-uploader'
import { ListingPricingSection } from './listing-pricing-section'
import { ListingPublishPanel } from './listing-publish-panel'
import { ListingPurposeSection } from './listing-purpose-section'
import { PATHS } from '../../../routes/paths'
import { getApiErrorCode } from '../../../services/http-client'
import { useListingPhotos } from '../hooks/use-listing-photos'
import {
  createToyListing,
  getListingErrorMessage,
  isUnauthorizedError,
  updateToyListing,
  type Category,
  type ToyListing,
} from '../toy-listing-api'
import { isListingTypeLocked, isRejected } from '../listing-display'
import { categoriesQuery } from '../toy-listing-queries'
import {
  EMPTY_LISTING_VALUES,
  LISTING_IMAGE_TYPES,
  LISTING_MAX_IMAGES,
  LISTING_PHOTO_LIMITS,
  listingSchema,
  tooFewPhotosMessage,
  type ListingFormValues,
} from '../toy-listing-schema'

/** Lỗi ở ô Danh mục khi máy chủ báo danh mục vừa chọn đã bị ẩn hoặc xoá (CATEGORY_NOT_FOUND) */
const CATEGORY_GONE_ERROR = 'Danh mục vừa chọn không còn hoạt động, vui lòng chọn danh mục khác'

/** Ảnh tin cho thuê / bán: tối đa 8 ảnh JPG hoặc PNG (GB-10) */
const LISTING_PHOTO_RULES = { maxImages: LISTING_MAX_IMAGES, acceptedTypes: LISTING_IMAGE_TYPES }

/** Đưa tin đăng từ backend về giá trị form */
function toSavedValues(listing?: ToyListing): Partial<ListingFormValues> {
  if (!listing) return EMPTY_LISTING_VALUES
  return {
    // Tin tặng không mở form này (trang sửa tin chặn trước), giữ kiểu cho chắc
    listingType: listing.listingType === 'donate' ? undefined : listing.listingType,
    title: listing.title,
    categoryId: listing.categoryId,
    minAge: listing.ageRange.minAge,
    maxAge: listing.ageRange.maxAge,
    condition: listing.condition,
    description: listing.description,
    priceOrRate: listing.priceOrRate,
    depositPrice: listing.depositPrice,
  }
}

interface ToyListingFormProps {
  /** Không truyền → chế độ tạo tin mới */
  listing?: ToyListing
  categories: Category[]
  categoriesLoading: boolean
  /** true khi GET /categories thành công: chỉ khi đó mới biết danh mục của tin đã bị ẩn */
  categoriesLoaded: boolean
  onSaved: (listing: ToyListing) => void
}

export function ToyListingForm({
  listing,
  categories,
  categoriesLoading,
  categoriesLoaded,
  onSaved,
}: ToyListingFormProps) {
  const location = useLocation()
  const queryClient = useQueryClient()
  const isEdit = Boolean(listing)

  const form = useForm<ListingFormValues>({
    resolver: zodResolver(listingSchema),
    defaultValues: toSavedValues(listing),
    mode: 'onTouched',
  })
  const { control, handleSubmit, reset, setError, setValue } = form
  const listingType = useWatch({ control, name: 'listingType' })
  const photos = useListingPhotos(listing?.images ?? [], LISTING_PHOTO_RULES)
  const [submitAttempted, setSubmitAttempted] = useState(false)

  const saveMutation = useMutation({
    mutationFn: (values: ListingFormValues) =>
      listing
        ? updateToyListing({
            toyId: listing.id,
            values,
            savedCategoryId: listing.categoryId,
            newImages: photos.newFiles,
            removeImagePublicIds: photos.removedPublicIds,
          })
        : createToyListing({ values, newImages: photos.newFiles }),
    onError: (error) => {
      // Danh mục vừa bị ẩn/xoá: tải lại danh sách để ô chọn không còn danh mục đó, và bỏ chọn nó.
      // Nếu không, trình duyệt hiện một danh mục khác trong khi form vẫn giữ danh mục cũ và lần
      // lưu sau lại gửi đúng danh mục đó.
      if (getApiErrorCode(error) === 'CATEGORY_NOT_FOUND') {
        setValue('categoryId', '')
        setError('categoryId', { type: 'server', message: CATEGORY_GONE_ERROR })
        void queryClient.invalidateQueries({ queryKey: categoriesQuery.queryKey })
      }
    },
    onSuccess: (saved) => {
      onSaved(saved)
      if (!isEdit) return
      reset(toSavedValues(saved))
      photos.resetTo(saved.images)
      setSubmitAttempted(false)
    },
  })

  // Danh mục của tin đã bị Admin ẩn thì không có trong GET /categories: vẫn hiện để giữ nguyên lựa chọn
  const savedCategoryHidden =
    listing && categoriesLoaded && !categories.some((category) => category.id === listing.categoryId)
  const categoryOptions: Category[] = savedCategoryHidden
    ? [
        ...categories,
        {
          id: listing.categoryId,
          name: `${listing.categoryName || 'Danh mục hiện tại'} (đã ẩn)`,
          slug: '',
          parentId: null,
        },
      ]
    : categories

  const isSaving = saveMutation.isPending
  // GB-08: sửa tin đang hiển thị hoặc bị từ chối là gửi Quản trị viên duyệt lại
  const rejected = listing ? isRejected(listing) : false
  const reviewNotice = rejected ? (
    <>
      Tin bị từ chối. Lý do: <strong>{listing?.moderation?.rejectReason}</strong>. Sửa theo lý do rồi bấm Gửi duyệt lại.
    </>
  ) : listing?.status === 'active' ? (
    <>
      Sau khi lưu, tin sẽ <strong>Chờ duyệt</strong> lại và tạm ẩn khỏi sàn cho đến khi Quản trị viên phê duyệt.
    </>
  ) : undefined
  const typeLocked = listing ? isListingTypeLocked(listing) : false
  // GB-10: tin thuê cần ít nhất 3 ảnh, tin bán ít nhất 4 ảnh
  const minPhotos = LISTING_PHOTO_LIMITS[listingType ?? 'rent'].min
  const photoRequiredError =
    submitAttempted && photos.photos.length < minPhotos ? tooFewPhotosMessage(minPhotos) : undefined

  const submit = () => {
    setSubmitAttempted(true)
    void handleSubmit((values) => {
      if (photos.photos.length < LISTING_PHOTO_LIMITS[values.listingType].min) return
      saveMutation.mutate(values)
    })()
  }

  const discardChanges = () => {
    reset(toSavedValues(listing))
    photos.resetTo(listing?.images ?? [])
    setSubmitAttempted(false)
    saveMutation.reset()
  }

  const saveError = saveMutation.isError
    ? {
        message: getListingErrorMessage(saveMutation.error),
        action: isUnauthorizedError(saveMutation.error) ? (
          <Link to={PATHS.login} state={{ from: location.pathname }} className="publish-error__link">
            Đăng nhập lại
          </Link>
        ) : undefined,
      }
    : undefined

  return (
    <FormProvider {...form}>
      <form
        className="listing-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <fieldset disabled={isSaving} className="listing-form__main">
          <ListingPurposeSection typeLocked={typeLocked} />
          <ListingPhotoUploader
            photos={photos.photos}
            minPhotos={minPhotos}
            maxPhotos={LISTING_MAX_IMAGES}
            acceptedTypes={LISTING_IMAGE_TYPES}
            rejections={photos.rejections}
            requiredError={photoRequiredError}
            canReorder={!isEdit}
            disabled={isSaving}
            onAddFiles={photos.addFiles}
            onRemove={photos.removePhoto}
            onMakeCover={photos.makeCover}
          />
          <ListingDetailsSection categories={categoryOptions} categoriesLoading={categoriesLoading} />
        </fieldset>

        <div className="listing-form__side">
          <fieldset disabled={isSaving} className="contents">
            <ListingPricingSection typeLocked={typeLocked} />
          </fieldset>
          <ListingPublishPanel
            isEdit={isEdit}
            reviewNotice={reviewNotice}
            saveLabel={rejected ? 'Gửi duyệt lại' : undefined}
            isSaving={isSaving}
            error={saveError}
            onDiscard={discardChanges}
          />
        </div>
      </form>
    </FormProvider>
  )
}
