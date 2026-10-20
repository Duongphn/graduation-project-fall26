import { Input, Select } from 'antd'
import type { Control, UseFormSetValue } from 'react-hook-form'

import { FormField } from '../../../components/common'
import type { Category } from '../../toy-listings/toy-listing-api'
import { AGE_OPTIONS, CONDITION_OPTIONS, TITLE_MAX_LENGTH } from '../../toy-listings/toy-listing-schema'
import { DONATION_DESCRIPTION_MAX, type DonationPostValues } from '../donation-post-schema'
import { DonationPostSection } from './donation-post-section'

interface DonationToySectionProps {
  control: Control<DonationPostValues>
  setValue: UseFormSetValue<DonationPostValues>
  categories: Category[]
  categoriesLoading: boolean
}

const choiceClass = (active: boolean) =>
  `rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
    active
      ? 'border-tf-primary bg-tf-primary-fixed font-semibold text-tf-primary'
      : 'border-tf-surface bg-white text-tf-ink hover:border-tf-outline'
  }`

/** Bước 01: tên, danh mục, độ tuổi, tình trạng, mô tả (ảnh nằm ngay dưới, xem trang) */
export function DonationToySection({ control, setValue, categories, categoriesLoading }: DonationToySectionProps) {
  return (
    <DonationPostSection
      step="01"
      title="Thông tin đồ chơi quyên góp"
      subtitle="Chọn đúng độ tuổi và tình trạng để ghép với tổ chức phù hợp."
      badge={<span className="rounded-md bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">Bắt buộc</span>}
    >
      <FormField control={control} name="title" label="Tên chi tiết món đồ" required>
        {(field) => (
          <Input {...field} maxLength={TITLE_MAX_LENGTH} showCount placeholder="VD: Bộ đồ chơi lắp ráp Lego tàu hoả & đường ray" />
        )}
      </FormField>

      <FormField control={control} name="categoryId" label="Danh mục phân loại" required>
        {(field) => (
          <Select
            value={field.value || undefined}
            onChange={field.onChange}
            onBlur={field.onBlur}
            loading={categoriesLoading}
            placeholder="Chọn danh mục"
            options={categories.map((category) => ({ value: category.id, label: category.name }))}
            showSearch
            optionFilterProp="label"
          />
        )}
      </FormField>

      <FormField control={control} name="minAge" label="Độ tuổi phù hợp" required>
        {(field) => (
          <div role="radiogroup" aria-label="Độ tuổi phù hợp" className="flex flex-wrap gap-2">
            {AGE_OPTIONS.map((option) => {
              const active = field.value === option.minAge
              return (
                <button
                  key={option.label}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={choiceClass(active)}
                  onClick={() => {
                    field.onChange(option.minAge)
                    setValue('maxAge', option.maxAge, { shouldDirty: true })
                  }}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        )}
      </FormField>

      <FormField control={control} name="condition" label="Tình trạng thực tế hiện tại" required>
        {(field) => (
          <div role="radiogroup" aria-label="Tình trạng" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {CONDITION_OPTIONS.map((option) => {
              const active = field.value === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={choiceClass(active)}
                  onClick={() => field.onChange(option.value)}
                >
                  <span className="block">{option.value}</span>
                  <span className="block text-xs font-normal text-tf-ink-muted">{option.hint}</span>
                </button>
              )
            })}
          </div>
        )}
      </FormField>

      <FormField control={control} name="description" label="Mô tả đồ chơi" required>
        {(field) => (
          <Input.TextArea
            {...field}
            rows={4}
            maxLength={DONATION_DESCRIPTION_MAX}
            showCount
            placeholder="Đồ chơi gồm những gì, đã dùng bao lâu, còn thiếu chi tiết nào không…"
          />
        )}
      </FormField>
    </DonationPostSection>
  )
}
