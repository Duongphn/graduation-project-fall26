import { ChevronDown } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { effectiveSort, hasLocation, SORT_LABELS } from '../catalog-search-params'
import type { CatalogFilters, CatalogSort } from '../toy-catalog-api'

type FilterPatch = Partial<CatalogFilters>

interface SelectFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  children: ReactNode
}

/** Ô chọn native (chạy tốt trên mobile), dùng chung kiểu .tf-select của form đăng tin */
export function SelectField({ label, value, onChange, children }: SelectFieldProps) {
  const id = useId()
  return (
    <div className="tf-field filter-select">
      <label htmlFor={id} className="tf-label filter-select__label">
        {label}
      </label>
      <div className="tf-select">
        <select id={id} className="tf-input" value={value} onChange={(event) => onChange(event.target.value)}>
          {children}
        </select>
        <ChevronDown className="tf-select__chevron" aria-hidden="true" />
      </div>
    </div>
  )
}

/** Chỉ hiện các kiểu sắp xếp mà backend chấp nhận với bộ lọc hiện tại */
export function SortSelect({ filters, onChange }: { filters: CatalogFilters; onChange: (patch: FilterPatch) => void }) {
  const sorts = (Object.keys(SORT_LABELS) as CatalogSort[]).filter(
    (sort) => (sort !== 'relevance' || filters.q) && (sort !== 'distance' || hasLocation(filters)),
  )

  return (
    <SelectField label="Sắp xếp" value={effectiveSort(filters)} onChange={(value) => onChange({ sort: value as CatalogSort })}>
      {sorts.map((sort) => (
        <option key={sort} value={sort}>
          {SORT_LABELS[sort]}
        </option>
      ))}
    </SelectField>
  )
}
