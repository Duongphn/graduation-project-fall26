import { useId, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import type { Category } from '../../toy-listings/toy-listing-api'
import {
  CLEARED_FILTERS,
  countActiveFilters,
  isPresetActive,
  orderCategories,
  PRICE_PRESETS,
} from '../catalog-search-params'
import type { CatalogFilters } from '../toy-catalog-api'

type FilterPatch = Partial<CatalogFilters>

/** Số danh mục hiện sẵn trước khi bấm "Xem thêm" */
const VISIBLE_CATEGORIES = 6

function PanelSection({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="filter-panel__section">
      <legend className="filter-panel__legend">{title}</legend>
      {hint && <p className="filter-panel__hint">{hint}</p>}
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

/**
 * Mức giá gợi ý áp dụng ngay; khoảng tự nhập cần bấm "Áp dụng" để không gọi API theo từng phím gõ.
 * Trang cha đặt `key` theo URL nên ô nhập làm mới khi giá đổi từ nơi khác (chip, gợi ý, nút Back).
 */
function PriceField({ filters, onChange }: { filters: CatalogFilters; onChange: (patch: FilterPatch) => void }) {
  const id = useId()
  const errorId = `${id}-error`
  const [min, setMin] = useState(filters.minPrice)
  const [max, setMax] = useState(filters.maxPrice)
  // Lỗi chỉ hiện sau khi bấm "Áp dụng", và tự hết khi khoảng giá đã đúng
  const [checked, setChecked] = useState(false)
  const error = checked && min !== undefined && max !== undefined && min > max ? PRICE_RANGE_ERROR : undefined
  const invalidProps = error ? { 'aria-invalid': true, 'aria-describedby': errorId } : {}
  const presets = filters.type ? PRICE_PRESETS[filters.type] : []

  const apply = (event: FormEvent) => {
    event.preventDefault()
    setChecked(true)
    if (min !== undefined && max !== undefined && min > max) return
    onChange({ minPrice: min, maxPrice: max })
  }

  return (
    <PanelSection
      title={filters.type === 'rent' ? 'Giá thuê mỗi ngày' : filters.type === 'sell' ? 'Giá mua' : 'Giá'}
      hint={
        filters.type === 'rent'
          ? 'Chưa gồm tiền cọc. Cọc được hoàn khi bạn trả đồ.'
          : filters.type
            ? undefined
            : 'Chọn "Thuê theo ngày" hoặc "Mua lại" để có mức giá gợi ý.'
      }
    >
      {presets.length > 0 && (
        <div className="price-presets">
          {presets.map((preset) => {
            const isOn = isPresetActive(filters, preset)
            return (
              <button
                key={preset.label}
                type="button"
                className="filter-pill"
                aria-pressed={isOn}
                onClick={() =>
                  onChange(isOn ? { minPrice: undefined, maxPrice: undefined } : { minPrice: preset.minPrice, maxPrice: preset.maxPrice })
                }
              >
                {preset.label}
              </button>
            )
          })}
        </div>
      )}

      {/* Không lồng <form> trong form: nhấn Enter trong ô giá cũng gọi apply qua onKeyDown */}
      <div className="price-custom">
        <label className="sr-only" htmlFor={`${id}-min`}>
          Giá từ
        </label>
        <input
          id={`${id}-min`}
          className={`tf-input filter-input ${error ? 'is-invalid' : ''}`}
          inputMode="numeric"
          placeholder="Từ"
          value={priceText(min)}
          onChange={(event) => setMin(parsePrice(event.target.value))}
          onKeyDown={(event) => event.key === 'Enter' && apply(event)}
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
          value={priceText(max)}
          onChange={(event) => setMax(parsePrice(event.target.value))}
          onKeyDown={(event) => event.key === 'Enter' && apply(event)}
          {...invalidProps}
        />
        <button type="button" className="price-custom__apply" onClick={apply}>
          Áp dụng
        </button>
      </div>
      {error && (
        <p id={errorId} className="tf-field-error" role="alert">
          {error}
        </p>
      )}
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
  /** Mỗi thay đổi áp dụng ngay (trừ khoảng giá tự nhập: chờ bấm "Áp dụng") */
  onChange: (patch: FilterPatch) => void
  /** Nút cuối panel, vd. "Xem kết quả" trong drawer màn hẹp */
  footer?: ReactNode
}

/** Giá → danh mục: thứ tự bố mẹ cân nhắc sau độ tuổi (độ tuổi nằm ở hàng lọc nhanh) */
export function FilterPanel({ filters, categories, onChange, footer }: FilterPanelProps) {
  const activeCount = countActiveFilters(filters)
  const titleId = useId()

  return (
    <div className="filter-panel" role="group" aria-labelledby={titleId}>
      <div className="filter-panel__head">
        <h2 id={titleId} className="filter-panel__title">
          Bộ lọc
        </h2>
        {activeCount > 0 && (
          <button type="button" className="filter-panel__clear" onClick={() => onChange(CLEARED_FILTERS)}>
            Xoá {activeCount} bộ lọc
          </button>
        )}
      </div>

      <PriceField filters={filters} onChange={onChange} />


      <CategoryField categories={categories} value={filters.categoryId} onChange={(categoryId) => onChange({ categoryId })} />

      {footer && <div className="filter-panel__foot">{footer}</div>}
    </div>
  )
}
