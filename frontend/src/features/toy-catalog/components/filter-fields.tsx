import { ChevronDown, LocateFixed, X } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { DEFAULT_RADIUS_KM, effectiveSort, hasLocation, RADIUS_OPTIONS, SORT_LABELS } from '../catalog-search-params'
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

const roundCoordinate = (value: number) => Math.round(value * 1000) / 1000 // ~100 m: đủ cho lọc theo km, không lộ vị trí chính xác trên URL

export function LocationField({ filters, onChange }: { filters: CatalogFilters; onChange: (patch: FilterPatch) => void }) {
  const [status, setStatus] = useState<'idle' | 'locating' | 'failed'>('idle')

  const locate = () => {
    if (!('geolocation' in navigator)) {
      setStatus('failed')
      return
    }
    setStatus('locating')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setStatus('idle')
        onChange({
          lat: roundCoordinate(position.coords.latitude),
          lng: roundCoordinate(position.coords.longitude),
          radiusKm: filters.radiusKm ?? DEFAULT_RADIUS_KM,
        })
      },
      () => setStatus('failed'),
      { timeout: 10_000, maximumAge: 5 * 60_000 },
    )
  }

  if (hasLocation(filters)) {
    const radius = filters.radiusKm ?? DEFAULT_RADIUS_KM
    const options: number[] = RADIUS_OPTIONS.includes(radius as (typeof RADIUS_OPTIONS)[number])
      ? [...RADIUS_OPTIONS]
      : [...RADIUS_OPTIONS, radius].sort((a, b) => a - b)

    return (
      <div className="filter-location filter-location--active">
        <SelectField label="Bán kính quanh bạn" value={String(radius)} onChange={(value) => onChange({ radiusKm: Number(value) })}>
          {options.map((km) => (
            <option key={km} value={km}>
              Trong {km} km
            </option>
          ))}
        </SelectField>
        <button
          type="button"
          className="filter-location__clear"
          aria-label="Bỏ lọc theo khu vực"
          onClick={() =>
            onChange({
              lat: undefined,
              lng: undefined,
              radiusKm: undefined,
              sort: filters.sort === 'distance' ? undefined : filters.sort,
            })
          }
        >
          <X aria-hidden="true" />
        </button>
      </div>
    )
  }

  return (
    <div className="filter-location">
      <button type="button" className="filter-location__locate" onClick={locate} disabled={status === 'locating'}>
        <LocateFixed aria-hidden="true" />
        {status === 'locating' ? 'Đang lấy vị trí…' : 'Gần tôi'}
      </button>
      {status === 'failed' && (
        <p role="alert" className="filter-location__error">
          Chưa lấy được vị trí. Hãy cho phép trình duyệt truy cập vị trí rồi thử lại.
        </p>
      )}
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
