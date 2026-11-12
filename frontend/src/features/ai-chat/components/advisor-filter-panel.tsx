import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { categoriesQuery } from '../../toy-listings/toy-listing-queries'
import {
  ADVISOR_AGE_OPTIONS,
  ADVISOR_LISTING_OPTIONS,
  ADVISOR_PRICE_OPTIONS,
  describeFilters,
} from '../advisor-filters'
import type { AdvisorFilters } from '../ai-chat-api'

interface AdvisorFilterPanelProps {
  initial: AdvisorFilters
  disabled: boolean
  onApply: (filters: AdvisorFilters, label: string) => void
  onClose: () => void
}

const chipClass = (active: boolean) =>
  `cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-white/60 ${
    active
      ? 'border-site-highlight-bright bg-site-highlight-bright text-site-ink'
      : 'border-white/25 text-white/85 hover:border-white/60'
  }`

const selectClass =
  'h-9 w-full rounded-lg border border-white/25 bg-white/10 px-2 text-sm text-white focus-visible:outline-2 focus-visible:outline-white/60'

const optionClass = 'bg-white text-tf-ink'

/** Lọc nhanh bằng nút (độ tuổi, loại đồ chơi, hình thức, mức giá): server bỏ qua bước AI trích bộ lọc */
export function AdvisorFilterPanel({ initial, disabled, onApply, onClose }: AdvisorFilterPanelProps) {
  const categories = useQuery(categoriesQuery)
  const [draft, setDraft] = useState(initial)
  const update = <K extends keyof AdvisorFilters>(key: K, value: AdvisorFilters[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  return (
    <fieldset disabled={disabled} className="flex flex-col gap-3 rounded-2xl bg-black/25 p-3">
      <legend className="sr-only">Lọc nhanh</legend>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs text-white/70">
          Độ tuổi
          <select
            value={draft.ageYears ?? ''}
            onChange={(event) => update('ageYears', event.target.value === '' ? null : Number(event.target.value))}
            className={selectClass}
          >
            <option value="" className={optionClass}>
              Mọi độ tuổi
            </option>
            {ADVISOR_AGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value} className={optionClass}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-white/70">
          Loại đồ chơi
          <select
            value={draft.category}
            onChange={(event) => update('category', event.target.value)}
            className={selectClass}
          >
            <option value="any" className={optionClass}>
              Mọi loại
            </option>
            {categories.data?.map((category) => (
              <option key={category.id} value={category.slug} className={optionClass}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div role="group" aria-label="Hình thức" className="flex flex-wrap gap-1.5">
        {ADVISOR_LISTING_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={draft.listingType === option.value}
            className={chipClass(draft.listingType === option.value)}
            onClick={() => update('listingType', option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div role="group" aria-label="Mức giá" className="flex flex-wrap gap-1.5">
        {ADVISOR_PRICE_OPTIONS.map((option) => (
          <button
            key={option.label}
            type="button"
            aria-pressed={draft.maxPrice === option.value}
            className={chipClass(draft.maxPrice === option.value)}
            onClick={() => update('maxPrice', option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="h-9 cursor-pointer rounded-full px-3 text-sm font-semibold text-white/75 hover:text-white"
        >
          Đóng
        </button>
        <button
          type="button"
          onClick={() => onApply(draft, describeFilters(draft, categories.data ?? []))}
          className="h-9 cursor-pointer rounded-full bg-site-highlight-bright px-4 text-sm font-bold text-site-ink transition-colors hover:bg-tf-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          Gợi ý theo bộ lọc
        </button>
      </div>
    </fieldset>
  )
}
