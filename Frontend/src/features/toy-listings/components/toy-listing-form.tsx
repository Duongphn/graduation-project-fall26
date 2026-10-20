import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import { Link, useLocation } from 'react-router-dom'
import { ListingDetailsSection } from './listing-details-section'
import { ListingPhotoUploader } from './listing-photo-uploader'
import { ListingPricingSection } from './listing-pricing-section'
import { ListingPublishPanel } from './listing-publish-panel'
import { ListingPurposeSection } from './listing-purpose-section'
import { PATHS } from '../../../routes/paths'
import { useListingPhotos } from '../hooks/use-listing-photos'
import {
  createToyListing,
  getListingErrorMessage,
  isUnauthorizedError,
  updateToyListing,
  type Category,
  type ToyListing,
} from '../toy-listing-api'
import { EMPTY_LISTING_VALUES, listingSchema, MIN_IMAGES, type ListingFormValues } from '../toy-listing-schema'

/** Đưa tin đăng từ backend về giá trị form */
function toSavedValues(listing?: ToyListing): Partial<ListingFormValues> {
  if (!listing) return EMPTY_LISTING_VALUES
  return {
    // Tin tặng không sửa bằng form này (backend từ chối đổi loại tin)
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
  onSaved: (listing: ToyListing) => void
}

export function ToyListingForm({ listing, categories, categoriesLoading, onSaved }: ToyListingFormProps) {
  const location = useLocation()
  const isEdit = Boolean(listing)

  const form = useForm<ListingFormValues>({
    resolver: zodResolver(listingSchema),
    defaultValues: toSavedValues(listing),
    mode: 'onTouched',
  })
  const { handleSubmit, reset } = form
  const photos = useListingPhotos(listing?.images ?? [])
  const [submitAttempted, setSubmitAttempted] = useState(false)

  const saveMutation = useMutation({
    mutationFn: (values: ListingFormValues) =>
      listing
        ? updateToyListing({
            toyId: listing.id,
            values,
            newImages: photos.newFiles,
            removeImagePublicIds: photos.removedPublicIds,
          })
        : createToyListing({ values, newImages: photos.newFiles }),
    onSuccess: (saved) => {
      onSaved(saved)
      if (!isEdit) return
      reset(toSavedValues(saved))
      photos.resetTo(saved.images)
      setSubmitAttempted(false)
    },
  })

  const isSaving = saveMutation.isPending
  const photoRequiredError =
    submitAttempted && photos.photos.length < MIN_IMAGES ? 'Cần ít nhất 1 ảnh thật của đồ chơi' : undefined

  const submit = () => {
    setSubmitAttempted(true)
    void handleSubmit((values) => {
      if (photos.photos.length < MIN_IMAGES) return
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
          <ListingPurposeSection />
          <ListingPhotoUploader
            photos={photos.photos}
            rejections={photos.rejections}
            requiredError={photoRequiredError}
            canReorder={!isEdit}
            disabled={isSaving}
            onAddFiles={photos.addFiles}
            onRemove={photos.removePhoto}
            onMakeCover={photos.makeCover}
          />
          <ListingDetailsSection categories={categories} categoriesLoading={categoriesLoading} />
        </fieldset>

        <div className="listing-form__side">
          <fieldset disabled={isSaving} className="contents">
            <ListingPricingSection />
          </fieldset>
          <ListingPublishPanel isEdit={isEdit} isSaving={isSaving} error={saveError} onDiscard={discardChanges} />
        </div>
      </form>
    </FormProvider>
  )
}
