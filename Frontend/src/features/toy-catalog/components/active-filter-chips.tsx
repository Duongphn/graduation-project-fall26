import { X } from 'lucide-react'
import type { Category } from '../../toy-listings/toy-listing-api'
import { AGE_OPTIONS } from '../../toy-listings/toy-listing-schema'
import { describePriceRange, findAgeOptionIndex } from '../catalog-search-params'
import type { CatalogFilters } from '../toy-catalog-api'

interface ActiveFilterChipsProps {
  filters: CatalogFilters
  categories: Category[]
  onChange: (patch: Partial<CatalogFilters>) => void
}

/**
 * Liệt kê điều kiện đang áp dụng, mỗi điều kiện gỡ được bằng một lần bấm.
 * Không gồm từ khoá (đã nằm trong câu tóm tắt) và loại tin (đã hiện ở tab).
 */
export function ActiveFilterChips({ filters, categories, onChange }: ActiveFilterChipsProps) {
  const chips: Array<{ key: string; label: string; patch: Partial<CatalogFilters> }> = []

  if (filters.categoryId) {
    const name = categories.find((c) => c.id === filters.categoryId)?.name ?? 'Danh mục đã chọn'
    chips.push({ key: 'category', label: name, patch: { categoryId: undefined } })
  }
  if (filters.ageMin !== undefined || filters.ageMax !== undefined) {
    const option = AGE_OPTIONS[findAgeOptionIndex(filters)]
    chips.push({
      key: 'age',
      label: option?.label ?? `${filters.ageMin ?? 0}–${filters.ageMax ?? '…'} tuổi`,
      patch: { ageMin: undefined, ageMax: undefined },
    })
  }
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    chips.push({ key: 'price', label: describePriceRange(filters), patch: { minPrice: undefined, maxPrice: undefined } })
  }
  if (filters.radiusKm !== undefined) {
    chips.push({
      key: 'area',
      label: `Trong ${filters.radiusKm} km`,
      patch: {
        lat: undefined,
        lng: undefined,
        radiusKm: undefined,
        sort: filters.sort === 'distance' ? undefined : filters.sort,
      },
    })
  }

  if (chips.length === 0) return null

  return (
    <ul className="filter-chips" aria-label="Điều kiện đang lọc">
      {chips.map((chip) => (
        <li key={chip.key}>
          <button type="button" className="filter-chip" onClick={() => onChange(chip.patch)} aria-label={`Bỏ điều kiện ${chip.label}`}>
            {chip.label}
            <X aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  )
}
