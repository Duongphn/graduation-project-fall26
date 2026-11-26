import { Checkbox } from 'antd'
import { ShieldCheck } from 'lucide-react'
import { Controller, useFormContext, useWatch } from 'react-hook-form'
import { FieldError, RequiredMark } from './listing-form-primitives'
import { LISTING_SAFETY_COMMITMENTS, type ListingFormValues } from '../toy-listing-schema'

/**
 * UC05: người đăng tự cam kết đồ chơi an toàn trước khi gửi tin đi duyệt. Mỗi lần lưu đều phải
 * tick lại, vì tin quay về Chờ duyệt.
 */
export function ListingSafetySection() {
  const {
    control,
    formState: { errors },
  } = useFormContext<ListingFormValues>()
  const safety = useWatch({ control, name: 'safety' })
  const checkedCount = LISTING_SAFETY_COMMITMENTS.filter(({ key }) => safety?.[key]).length
  const errorMessage = errors.safety?.message

  return (
    <section className="tf-card tf-card--side">
      <fieldset className="safety-checklist" aria-describedby={errorMessage ? 'safety-error' : undefined}>
        <legend className="tf-section-title tf-section-title--sm">
          <span className="tf-section-title__icon">
            <ShieldCheck aria-hidden />
          </span>
          Cam kết an toàn ({checkedCount}/{LISTING_SAFETY_COMMITMENTS.length})
          <RequiredMark />
        </legend>
        <p className="tf-card__subtitle">
          Bạn chịu trách nhiệm về đồ chơi mình đăng. Hệ thống lưu lại thời điểm bạn cam kết.
        </p>

        <Controller
          control={control}
          name="safety"
          render={({ field }) => (
            <ul className="safety-list">
              {LISTING_SAFETY_COMMITMENTS.map((item, index) => (
                <li key={item.key} className="safety-item">
                  <Checkbox
                    // Lỗi từ máy chủ đưa focus về mục đầu tiên
                    ref={index === 0 ? field.ref : undefined}
                    checked={field.value[item.key]}
                    onChange={(event) => field.onChange({ ...field.value, [item.key]: event.target.checked })}
                  >
                    <span className="safety-item__title">{item.title}</span>
                    <span className="safety-item__hint">{item.hint}</span>
                  </Checkbox>
                </li>
              ))}
            </ul>
          )}
        />
        <FieldError id="safety-error" message={errorMessage} />
      </fieldset>
    </section>
  )
}
