import { SlidersHorizontal } from 'lucide-react'
import { useId, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import type { Category } from '../../toy-listings/toy-listing-api'
import { formatVnd } from '../../toy-listings/format-vnd'
import { AGE_OPTIONS } from '../../toy-listings/toy-listing-schema'
import { CLEARED_FILTERS, findAgeOptionIndex, orderCategories } from '../catalog-search-params'
import type { CatalogFilters } from '../toy-catalog-api'
import { LocationField, SelectField } from './filter-fields'

type FilterPatch = Partial<CatalogFilters>

/** Thang kéo của thanh trượt giá: giá thuê theo ngày nhỏ hơn hẳn giá bán */
const PRICE_SCALE = {
  rent: { max: 500_000, step: 5_000 },
  sell: { max: 3_000_000, step: 50_000 },
} as const

/** Số danh mục hiện sẵn trước khi bấm "Xem thêm" */
const VISIBLE_CATEGORIES = 6

function PanelSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <fieldset className="filter-panel__section">
      {title && <legend className="filter-panel__legend">{title}</legend>}
      {children}
    </fieldset>
  )
}

const parsePrice = (raw: string) => {
  const digits = raw.replace(/\D/g, '')
  return digits === '' ? undefined : Number(digits)
}

const priceText = (value: number | undefined) => (value === undefined ? '' : new Intl.NumberFormat('vi-VN').format(value))

/** R03 2.1.1 (3): "Từ" phải nhỏ hơn hoặc bằng "Đến", nếu không thì báo lỗi và không áp dụng */
const PRICE_RANGE_ERROR = 'Giá "Từ" phải nhỏ hơn hoặc bằng giá "Đến".'

const isPriceRangeInverted = ({ minPrice, maxPrice }: CatalogFilters) =>
  minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice

interface PriceFieldProps {
  draft: CatalogFilters
  onChange: (patch: FilterPatch) => void
  error?: string
}

function PriceField({ draft, onChange, error }: PriceFieldProps) {
  const id = useId()
  const errorId = `${id}-error`
  const invalidProps = error ? { 'aria-invalid': true, 'aria-describedby': errorId } : {}
  const scale = PRICE_SCALE[draft.type ?? 'sell']
  const low = Math.min(draft.minPrice ?? 0, scale.max)
  const high = Math.min(draft.maxPrice ?? scale.max, scale.max)
  // Kéo hết về đầu/cuối thang nghĩa là không giới hạn phía đó
  const setLow = (value: number) => onChange({ minPrice: value <= 0 ? undefined : Math.min(value, high) })
  const setHigh = (value: number) => onChange({ maxPrice: value >= scale.max ? undefined : Math.max(value, low) })

  return (
    <PanelSection title={draft.type === 'rent' ? 'Giá thuê / ngày (₫)' : 'Giá (₫)'}>
      <div className="price-field__inputs">
        <label className="sr-only" htmlFor={`${id}-min`}>
          Giá từ
        </label>
        <input
          id={`${id}-min`}
          className={`tf-input filter-input ${error ? 'is-invalid' : ''}`}
          inputMode="numeric"
          placeholder="Từ"
          value={priceText(draft.minPrice)}
          onChange={(event) => onChange({ minPrice: parsePrice(event.target.value) })}
          {...invalidProps}
        />
        <span aria-hidden="true">–</span>
        <label className="sr-only" htmlFor={`${id}-max`}>
          Giá đến
        </label>
        <input
          id={`${id}-max`}
          className={`tf-input filter-input ${error ? 'is-invalid' : ''}`}
          inputMode="numeric"
          placeholder="Đến"
          value={priceText(draft.maxPrice)}
          onChange={(event) => onChange({ maxPrice: parsePrice(event.target.value) })}
          {...invalidProps}
        />
      </div>
      {error && (
        <p id={errorId} className="tf-field-error" role="alert">
          {error}
        </p>
      )}

      <div
        className="price-range"
        style={{ '--low': `${(low / scale.max) * 100}%`, '--high': `${(high / scale.max) * 100}%` } as CSSProperties}
      >
        <input
          type="range"
          min={0}
          max={scale.max}
          step={scale.step}
          value={low}
          aria-label="Giá thấp nhất"
          aria-valuetext={low === 0 ? 'Không giới hạn' : formatVnd(low)}
          onChange={(event) => setLow(Number(event.target.value))}
        />
        <input
          type="range"
          min={0}
          max={scale.max}
          step={scale.step}
          value={high}
          aria-label="Giá cao nhất"
          aria-valuetext={high === scale.max ? 'Không giới hạn' : formatVnd(high)}
          onChange={(event) => setHigh(Number(event.target.value))}
        />
      </div>
      <p className="filter-panel__hint">
        {draft.type === 'rent'
          ? 'Giá cho mỗi ngày thuê, chưa gồm tiền cọc.'
          : draft.type === 'sell'
            ? 'Giá bán một lần.'
            : 'Chọn "Cho thuê" để lọc theo giá thuê mỗi ngày.'}
      </p>
    </PanelSection>
  )
}

function CategoryField({
  categories,
  value,
  onChange,
}: {
  categories: Category[]
  value: string | undefined
  onChange: (categoryId: string | undefined) => void
}) {
  const name = useId()
  const ordered = orderCategories(categories)
  const selectedIndex = ordered.findIndex(({ category }) => category.id === value)
  // Danh mục đang chọn nằm sâu trong danh sách thì mở sẵn để người dùng thấy lựa chọn của mình
  const [expanded, setExpanded] = useState(selectedIndex >= VISIBLE_CATEGORIES)
  const visible = expanded ? ordered : ordered.slice(0, VISIBLE_CATEGORIES)

  const option = (id: string | undefined, label: string, depth = 0) => (
    <li key={id ?? 'all'}>
      <label className="filter-option" style={{ '--depth': depth } as CSSProperties}>
        <input type="radio" name={name} checked={value === id} onChange={() => onChange(id)} />
        <span>{label}</span>
      </label>
    </li>
  )

  return (
    <PanelSection title="Danh mục">
      <ul className="filter-options">
        {option(undefined, 'Tất cả danh mục')}
        {visible.map(({ category, depth }) => option(category.id, category.name, depth))}
      </ul>
      {ordered.length > VISIBLE_CATEGORIES && (
        <button type="button" className="filter-panel__more" onClick={() => setExpanded((open) => !open)}>
          {expanded ? 'Thu gọn' : `Xem thêm ${ordered.length - VISIBLE_CATEGORIES} danh mục`}
        </button>
      )}
    </PanelSection>
  )
}

interface FilterPanelProps {
  filters: CatalogFilters
  categories: Category[]
  /** Nhận toàn bộ bộ lọc nháp khi bấm "Áp dụng" */
  onApply: (patch: FilterPatch) => void
  className?: string
}

/**
 * Bộ lọc dạng form: chỉnh nhiều điều kiện rồi áp dụng một lần, tránh gọi API theo từng phím gõ ô giá.
 * Bản nháp khởi tạo từ URL; trang cha đặt `key` theo URL để nháp làm mới khi bộ lọc đổi từ nơi khác (chip, gợi ý).
 */
export function FilterPanel({ filters, categories, onApply, className }: FilterPanelProps) {
  const [draft, setDraft] = useState(filters)
  // Lỗi khoảng giá chỉ hiện sau khi bấm "Áp dụng", và tự hết khi khoảng giá đã đúng
  const [priceChecked, setPriceChecked] = useState(false)
  const priceError = priceChecked && isPriceRangeInverted(draft) ? PRICE_RANGE_ERROR : undefined
  const update = (patch: FilterPatch) => setDraft((current) => ({ ...current, ...patch }))
  const ageIndex = findAgeOptionIndex(draft)
  const hasAge = draft.ageMin !== undefined || draft.ageMax !== undefined

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    // R03 2.1.1 (3): "Từ" lớn hơn "Đến" thì báo lỗi, không áp dụng bộ lọc
    setPriceChecked(true)
    if (isPriceRangeInverted(draft)) return
    onApply({
      type: draft.type,
      categoryId: draft.categoryId,
      ageMin: draft.ageMin,
      ageMax: draft.ageMax,
      minPrice: draft.minPrice,
      maxPrice: draft.maxPrice,
      lat: draft.lat,
      lng: draft.lng,
      radiusKm: draft.radiusKm,
      sort: draft.sort === 'distance' && draft.lat === undefined ? undefined : draft.sort,
    })
  }

  const clearAll = () => {
    setDraft((current) => ({ ...current, ...CLEARED_FILTERS }))
    onApply(CLEARED_FILTERS)
  }

  return (
    <form className={`tf-card filter-panel ${className ?? ''}`} onSubmit={submit} aria-label="Bộ lọc">
      <div className="filter-panel__head">
        <h2 className="tf-section-title tf-section-title--md">
          <span className="tf-section-title__icon">
            <SlidersHorizontal aria-hidden="true" />
          </span>
          Bộ lọc
        </h2>
        <button type="button" className="filter-panel__clear" onClick={clearAll}>
          Xoá tất cả
        </button>
      </div>

      <PanelSection>
        <SelectField
          label="Độ tuổi phù hợp"
          value={ageIndex >= 0 ? String(ageIndex) : hasAge ? 'custom' : ''}
          onChange={(value) => {
            const option = AGE_OPTIONS[Number(value)]
            update(value === '' || !option ? { ageMin: undefined, ageMax: undefined } : { ageMin: option.minAge, ageMax: option.maxAge })
          }}
        >
          <option value="">Mọi độ tuổi</option>
          {AGE_OPTIONS.map((option, index) => (
            <option key={option.label} value={index}>
              {option.label}
            </option>
          ))}
          {ageIndex < 0 && hasAge && (
            <option value="custom" disabled>
              Từ {draft.ageMin ?? 0} đến {draft.ageMax ?? '…'} tuổi
            </option>
          )}
        </SelectField>
      </PanelSection>

      <CategoryField categories={categories} value={draft.categoryId} onChange={(categoryId) => update({ categoryId })} />

      <PriceField draft={draft} onChange={update} error={priceError} />

      <PanelSection title="Khu vực">
        <LocationField filters={draft} onChange={update} />
      </PanelSection>

      <div className="filter-panel__foot">
        <button type="submit" className="pl-btn pl-btn--primary filter-panel__apply">
          Áp dụng bộ lọc
        </button>
      </div>
    </form>
  )
}
