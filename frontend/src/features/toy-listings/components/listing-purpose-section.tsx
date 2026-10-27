import { ArrowLeftRight, CalendarDays, CheckCircle2, Tag } from 'lucide-react'
import { useFormContext, useWatch } from 'react-hook-form'
import { RequiredMark, SectionTitle } from './listing-form-primitives'
import type { ListingFormValues } from '../toy-listing-schema'

const PURPOSES = [
  { value: 'rent', title: 'Cho thuê', hint: 'Thu về dòng tiền định kỳ. Giữ quyền sở hữu đồ chơi.', icon: CalendarDays },
  { value: 'sell', title: 'Bán lại', hint: 'Chuyển nhượng dọn nhà, thu tiền trọn gói.', icon: Tag },
] as const

export function ListingPurposeSection() {
  const { control, setValue } = useFormContext<ListingFormValues>()
  const listingType = useWatch({ control, name: 'listingType' })

  return (
    <section className="tf-card">
      <SectionTitle icon={<ArrowLeftRight aria-hidden />}>
        Mục đích đăng tin
        <RequiredMark />
      </SectionTitle>

      <div className="purpose-grid" role="radiogroup" aria-label="Mục đích đăng tin">
        {PURPOSES.map(({ value, title, hint, icon: Icon }) => (
          <label key={value} className={`purpose-card purpose-card--${value}`}>
            <input
              type="radio"
              name="listingType"
              value={value}
              checked={listingType === value}
              onChange={() => setValue('listingType', value, { shouldDirty: true, shouldValidate: true })}
              className="sr-only"
            />
            <span className="purpose-card__head">
              <span className="purpose-card__title-row">
                <span className="purpose-card__icon">
                  <Icon aria-hidden />
                </span>
                <span className="purpose-card__title">{title}</span>
              </span>
              <CheckCircle2 aria-hidden className="purpose-card__check" />
            </span>
            <span className="purpose-card__hint">{hint}</span>
          </label>
        ))}
      </div>
    </section>
  )
}
