import { ChevronDown, Shapes } from 'lucide-react'
import { useFormContext, useWatch } from 'react-hook-form'
import { FieldError, RequiredMark, SectionTitle } from './listing-form-primitives'
import type { Category } from '../toy-listing-api'
import {
  AGE_OPTIONS,
  CONDITION_OPTIONS,
  DESCRIPTION_MAX_LENGTH,
  DESCRIPTION_MIN_LENGTH,
  TITLE_MAX_LENGTH,
  type ListingFormValues,
} from '../toy-listing-schema'

const ageKey = (minAge: number, maxAge: number) => `${minAge}-${maxAge}`

interface ListingDetailsSectionProps {
  categories: Category[]
  categoriesLoading: boolean
}

export function ListingDetailsSection({ categories, categoriesLoading }: ListingDetailsSectionProps) {
  const {
    control,
    register,
    setValue,
    formState: { errors },
  } = useFormContext<ListingFormValues>()
  const [title, minAge, maxAge, condition] = useWatch({ control, name: ['title', 'minAge', 'maxAge', 'condition'] })

  const currentAgeKey = minAge !== undefined && maxAge !== undefined ? ageKey(minAge, maxAge) : ''
  // Tin cũ có khoảng tuổi ngoài danh sách gợi ý vẫn phải hiển thị đúng
  const hasCustomAge = currentAgeKey !== '' && !AGE_OPTIONS.some((option) => ageKey(option.minAge, option.maxAge) === currentAgeKey)

  return (
    <section className="tf-card tf-card--roomy">
      <SectionTitle icon={<Shapes aria-hidden />}>Thông tin chi tiết đồ chơi</SectionTitle>

      <div className="tf-field">
        <div className="tf-field__label-row">
          <label htmlFor="title" className="tf-label">
            Tên đồ chơi
            <RequiredMark />
          </label>
          <span className="tf-caption">
            {title?.length ?? 0}/{TITLE_MAX_LENGTH} ký tự
          </span>
        </div>
        <input
          id="title"
          type="text"
          maxLength={TITLE_MAX_LENGTH}
          className={`tf-input ${errors.title ? 'is-invalid' : ''}`}
          placeholder="Nhập tên chính xác kèm thương hiệu (ví dụ: Bộ Lego Disney Castle, Xe chòi chân...)"
          aria-invalid={!!errors.title}
          aria-describedby={errors.title ? 'title-error' : undefined}
          {...register('title')}
        />
        <FieldError id="title-error" message={errors.title?.message} />
      </div>

      <div className="tf-field-grid">
        <div className="tf-field">
          <label htmlFor="categoryId" className="tf-label">
            Danh mục
            <RequiredMark />
          </label>
          <div className="tf-select">
            <select
              id="categoryId"
              className={`tf-input ${errors.categoryId ? 'is-invalid' : ''}`}
              aria-invalid={!!errors.categoryId}
              aria-describedby={errors.categoryId ? 'categoryId-error' : undefined}
              {...register('categoryId')}
            >
              <option value="" disabled>
                {categoriesLoading ? 'Đang tải danh mục...' : 'Chọn danh mục'}
              </option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <ChevronDown aria-hidden className="tf-select__chevron" />
          </div>
          <FieldError id="categoryId-error" message={errors.categoryId?.message} />
        </div>

        <div className="tf-field">
          <label htmlFor="ageRange" className="tf-label">
            Độ tuổi phù hợp
            <RequiredMark />
          </label>
          <div className="tf-select">
            <select
              id="ageRange"
              className={`tf-input ${errors.minAge ? 'is-invalid' : ''}`}
              value={currentAgeKey}
              aria-invalid={!!errors.minAge}
              aria-describedby={errors.minAge ? 'ageRange-error' : undefined}
              onChange={(event) => {
                const [nextMin, nextMax] = event.target.value.split('-').map(Number)
                setValue('minAge', nextMin, { shouldDirty: true, shouldValidate: true })
                setValue('maxAge', nextMax, { shouldDirty: true, shouldValidate: true })
              }}
            >
              <option value="" disabled>
                Chọn độ tuổi
              </option>
              {AGE_OPTIONS.map((option) => (
                <option key={option.label} value={ageKey(option.minAge, option.maxAge)}>
                  {option.label}
                </option>
              ))}
              {hasCustomAge && (
                <option value={currentAgeKey}>
                  {minAge} - {maxAge} tuổi
                </option>
              )}
            </select>
            <ChevronDown aria-hidden className="tf-select__chevron" />
          </div>
          <FieldError id="ageRange-error" message={errors.minAge?.message} />
        </div>
      </div>

      <div className="tf-field">
        <span className="tf-label" id="condition-label">
          Tình trạng thực tế
          <RequiredMark />
        </span>
        <div className="condition-grid" role="radiogroup" aria-labelledby="condition-label">
          {CONDITION_OPTIONS.map((option) => (
            <label key={option.value} className="condition-card">
              <input
                type="radio"
                name="condition"
                value={option.value}
                checked={condition === option.value}
                onChange={() => setValue('condition', option.value, { shouldDirty: true, shouldValidate: true })}
                className="sr-only"
              />
              <span className="condition-card__title">{option.value}</span>
              <span className="condition-card__hint">{option.hint}</span>
            </label>
          ))}
        </div>
        <FieldError id="condition-error" message={errors.condition?.message} />
      </div>

      <div className="tf-field">
        <label htmlFor="description" className="tf-label">
          Mô tả chi tiết & Cam kết vệ sinh
          <RequiredMark />
        </label>
        <textarea
          id="description"
          rows={5}
          maxLength={DESCRIPTION_MAX_LENGTH}
          className={`tf-input tf-input--textarea ${errors.description ? 'is-invalid' : ''}`}
          placeholder="Mô tả các phụ kiện đi kèm, tình trạng bảo quản, lưu ý khi chơi..."
          aria-invalid={!!errors.description}
          aria-describedby="description-hint"
          {...register('description')}
        />
        <p id="description-hint" className="tf-caption">
          {DESCRIPTION_MIN_LENGTH} đến {DESCRIPTION_MAX_LENGTH} ký tự. Không bao gồm số điện thoại hoặc số tài khoản ngân hàng.
        </p>
        <FieldError id="description-error" message={errors.description?.message} />
      </div>
    </section>
  )
}
