import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Alert, Form } from 'antd'
import { Send } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'

import { getApiErrorCode } from '../../../services/http-client'
import { ListingPhotoUploader } from '../../toy-listings/components/listing-photo-uploader'
import { CONTACT_DETAILS_MESSAGES } from '../../toy-listings/contact-details'
import { useListingPhotos } from '../../toy-listings/hooks/use-listing-photos'
import { isRejected } from '../../toy-listings/listing-display'
import {
  getContactDetailsField,
  getListingErrorMessage,
  type Category,
  type ToyListing,
} from '../../toy-listings/toy-listing-api'
import { categoriesQuery } from '../../toy-listings/toy-listing-queries'
import { MAX_IMAGES } from '../../toy-listings/toy-listing-schema'
import { updateDonationPost } from '../donation-post-api'
import {
  AUTO_MATCH,
  EMPTY_DONATION_POST,
  MIN_DONATION_PHOTOS,
  donationPostSchema,
  findBannedTerms,
  isPhotoCountValid,
  type DonationPostValues,
} from '../donation-post-schema'
import { DonationSafetySection } from './donation-safety-section'
import { DonationToySection } from './donation-toy-section'

interface DonationPostEditFormProps {
  listing: ToyListing
  categories: Category[]
  categoriesLoading: boolean
  onSaved: (listing: ToyListing) => void
}

/** Giá trị form từ tin tặng đã lưu; cam kết an toàn phải tick lại mỗi lần gửi duyệt. */
const toValues = (listing: ToyListing): Partial<DonationPostValues> => ({
  ...EMPTY_DONATION_POST,
  title: listing.title,
  categoryId: listing.categoryId,
  minAge: listing.ageRange.minAge,
  maxAge: listing.ageRange.maxAge,
  condition: listing.condition,
  description: listing.description,
  // Tổ chức đã chọn (nếu có) vẫn lưu cùng tin ở máy chủ; form sửa không đổi phần này
  receiver: AUTO_MATCH,
})

/**
 * Người tặng sửa tin tặng bị Admin từ chối rồi gửi duyệt lại (UC33 5.1, BF-04 3a): thông tin đồ chơi,
 * 3–10 ảnh và 4 cam kết an toàn như lúc tạo phiếu.
 */
export function DonationPostEditForm({ listing, categories, categoriesLoading, onSaved }: DonationPostEditFormProps) {
  const queryClient = useQueryClient()
  const photos = useListingPhotos(listing.images)
  const [photoError, setPhotoError] = useState<string>()
  const { control, handleSubmit, setError, setValue } = useForm<DonationPostValues>({
    resolver: zodResolver(donationPostSchema),
    defaultValues: toValues(listing),
  })
  const [title, description, safety] = useWatch({ control, name: ['title', 'description', 'safety'] })
  const bannedTerms = findBannedTerms(title ?? '', description ?? '')
  const safetyChecked = Object.values(safety ?? {}).filter(Boolean).length
  const rejected = isRejected(listing)

  // Danh mục của tin đã bị Admin ẩn thì không có trong GET /categories: vẫn hiện để giữ lựa chọn
  const categoryOptions = categories.some((category) => category.id === listing.categoryId)
    ? categories
    : [
        ...categories,
        { id: listing.categoryId, name: `${listing.categoryName || 'Danh mục hiện tại'} (đã ẩn)`, slug: '', parentId: null },
      ]

  const save = useMutation({
    mutationFn: (values: DonationPostValues) =>
      updateDonationPost(listing.id, {
        title: values.title,
        categoryId: values.categoryId,
        savedCategoryId: listing.categoryId,
        condition: values.condition,
        description: values.description,
        minAge: values.minAge,
        maxAge: values.maxAge,
        newImages: photos.newFiles,
        removeImagePublicIds: photos.removedPublicIds,
      }),
    onError: (error) => {
      const contactField = getContactDetailsField(error)
      if (contactField) {
        setError(contactField, { type: 'server', message: CONTACT_DETAILS_MESSAGES[contactField] }, { shouldFocus: true })
      }
      // Danh mục vừa bị Admin ẩn hoặc xoá: tải lại danh sách để chọn danh mục khác
      if (getApiErrorCode(error) === 'CATEGORY_NOT_FOUND') {
        void queryClient.invalidateQueries({ queryKey: categoriesQuery.queryKey })
      }
    },
    onSuccess: onSaved,
  })

  const checkPhotos = () => {
    const ok = isPhotoCountValid(photos.photos.length)
    setPhotoError(ok ? undefined : `Cần từ ${MIN_DONATION_PHOTOS} đến ${MAX_IMAGES} ảnh chụp thực tế.`)
    return ok
  }

  const submit = handleSubmit(
    (values) => {
      if (checkPhotos()) save.mutate(values)
    },
    () => void checkPhotos(),
  )

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {rejected && (
        <Alert
          type="warning"
          showIcon
          title={
            <>
              Tin bị từ chối. Lý do: <strong>{listing.moderation?.rejectReason?.replace(/[.\s]+$/, '')}</strong>. Sửa
              theo lý do rồi bấm Gửi duyệt lại.
            </>
          }
        />
      )}
      <Form layout="vertical" component="div" disabled={save.isPending} className="flex min-w-0 flex-col gap-6">
        <DonationToySection
          control={control}
          setValue={setValue}
          categories={categoryOptions}
          categoriesLoading={categoriesLoading}
        />
        <ListingPhotoUploader
          photos={photos.photos}
          rejections={photos.rejections}
          requiredError={photoError}
          minPhotos={MIN_DONATION_PHOTOS}
          canReorder={false}
          disabled={save.isPending}
          onAddFiles={(files) => {
            photos.addFiles(files)
            setPhotoError(undefined)
          }}
          onRemove={photos.removePhoto}
          onMakeCover={photos.makeCover}
        />
        <DonationSafetySection control={control} checkedCount={safetyChecked} bannedTerms={bannedTerms} />
      </Form>

      {save.isError && <Alert type="error" showIcon title={getListingErrorMessage(save.error)} />}

      <button
        type="button"
        className="inline-flex h-11 items-center justify-center gap-2 self-end rounded-full bg-tf-primary px-6 text-sm font-bold text-white transition-colors hover:bg-tf-primary-container disabled:opacity-60"
        disabled={save.isPending || bannedTerms.length > 0}
        onClick={() => void submit()}
      >
        <Send className="size-4" aria-hidden />
        {save.isPending ? 'Đang gửi…' : rejected ? 'Gửi duyệt lại' : 'Lưu thay đổi'}
      </button>
    </div>
  )
}
