import { ArrowUpRight, Baby } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PATHS } from '../../../routes/paths'
import { AGE_OPTIONS } from '../../toy-listings/toy-listing-schema'
import { AGE_CHIP_LABELS, findAgeOptionIndex, toCatalogSearch } from '../catalog-search-params'
import type { CatalogFilters } from '../toy-catalog-api'

type FilterPatch = Partial<CatalogFilters>

const TYPES: Array<{ label: string; type?: CatalogFilters['type'] }> = [
  { label: 'Tất cả' },
  { label: 'Thuê theo ngày', type: 'rent' },
  { label: 'Mua lại', type: 'sell' },
]

/**
 * Loại tin dạng link (?type=…) để mở tab mới / chia sẻ được. Đổi loại tin thì bỏ khoảng giá vì giá thuê
 * theo ngày và giá bán không cùng thang. Đồ tặng không lọc được qua API tìm kiếm nên dẫn về mục quyên góp
 * trên trang chủ, giống menu "Quyên góp" ở header.
 */
export function TypeSwitch({ filters }: { filters: CatalogFilters }) {
  return (
    <nav className="type-switch" aria-label="Loại tin">
      {TYPES.map(({ label, type }) => {
        const isActive = type === filters.type
        const search = toCatalogSearch({ ...filters, type, minPrice: undefined, maxPrice: undefined, page: 1 })
        return (
          <Link
            key={label}
            to={`?${search}`}
            className="type-switch__option"
            aria-current={isActive ? 'page' : undefined}
          >
            {label}
          </Link>
        )
      })}
      <Link to={PATHS.donations} className="type-switch__option type-switch__option--out">
        Đồ tặng
        <ArrowUpRight aria-hidden="true" />
      </Link>
    </nav>
  )
}

/** Độ tuổi là điều bố mẹ lọc đầu tiên: một chạm là áp dụng, chạm lại chip đang chọn để bỏ */
export function AgeChips({ filters, onChange }: { filters: CatalogFilters; onChange: (patch: FilterPatch) => void }) {
  const selected = findAgeOptionIndex(filters)

  return (
    <div className="age-chips" role="group" aria-labelledby="age-chips-label">
      <span id="age-chips-label" className="age-chips__label">
        <Baby aria-hidden="true" />
        Bé mấy tuổi?
      </span>
      <div className="age-chips__list">
        {AGE_OPTIONS.map((option, index) => {
          const isOn = index === selected
          return (
            <button
              key={option.label}
              type="button"
              className="age-chip"
              aria-pressed={isOn}
              title={option.label}
              onClick={() =>
                onChange(
                  isOn
                    ? { ageMin: undefined, ageMax: undefined }
                    : { ageMin: option.minAge, ageMax: option.maxAge },
                )
              }
            >
              {AGE_CHIP_LABELS[index]}
            </button>
          )
        })}
      </div>
    </div>
  )
}
