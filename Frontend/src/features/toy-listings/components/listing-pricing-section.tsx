import { Banknote, Lock } from 'lucide-react'
import { Controller, useFormContext, useWatch } from 'react-hook-form'
import { FieldError, MoneyInput, RequiredMark, SectionTitle } from './listing-form-primitives'
import type { ListingType } from '../toy-listing-api'
import type { ListingFormValues } from '../toy-listing-schema'

export function ListingPricingSection() {
  const {
    control,
    setValue,
    formState: { errors },
  } = useFormContext<ListingFormValues>()
  const listingType = useWatch({ control, name: 'listingType' })
  const isRent = listingType === 'rent'

  const switchType = (next: ListingType) => setValue('listingType', next, { shouldDirty: true, shouldValidate: true })

  return (
    <section className="tf-card tf-card--side">
      <div className="pricing-head">
        <SectionTitle size="sm" icon={<Banknote aria-hidden />}>
          Giá & Cọc
        </SectionTitle>
        <div className="tf-segmented" role="group" aria-label="Loại tin">
          <button type="button" aria-pressed={isRent} className={isRent ? 'is-active' : ''} onClick={() => switchType('rent')}>
            Thuê
          </button>
          <button type="button" aria-pressed={!isRent} className={!isRent ? 'is-active' : ''} onClick={() => switchType('sell')}>
            Bán lại
          </button>
        </div>
      </div>

      <div className="tf-field">
        <label htmlFor="priceOrRate" className="tf-label">
          {isRent ? 'Giá thuê theo ngày' : 'Giá bán mong muốn'}
          <RequiredMark />
        </label>
        <Controller
          control={control}
          name="priceOrRate"
          render={({ field }) => (
            <MoneyInput
              id="priceOrRate"
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              unit={isRent ? 'VND / ngày' : 'VND'}
              tone={isRent ? 'primary' : 'tertiary'}
              invalid={!!errors.priceOrRate}
            />
          )}
        />
        <FieldError id="priceOrRate-error" message={errors.priceOrRate?.message} />
      </div>

      {isRent ? (
        <div className="tf-field">
          <label htmlFor="depositPrice" className="tf-label">
            Tiền cọc bảo chứng
            <RequiredMark />
          </label>
          <Controller
            control={control}
            name="depositPrice"
            render={({ field }) => (
              <MoneyInput
                id="depositPrice"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                unit="VND"
                invalid={!!errors.depositPrice}
              />
            )}
          />
          <FieldError id="depositPrice-error" message={errors.depositPrice?.message} />
        </div>
      ) : (
        // Backend luôn lưu quantity = 1 cho tin bán lại
        <div className="tf-field">
          <span className="tf-label">Số lượng sẵn có</span>
          <div className="tf-affix-input">
            <input type="text" disabled value="1 (Cố định)" className="tf-input tf-input--locked" aria-label="Số lượng sẵn có" />
            <Lock aria-hidden className="tf-affix-input__icon" />
          </div>
        </div>
      )}
    </section>
  )
}
