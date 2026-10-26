import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PATHS } from '../../../routes/paths'
import { RADIUS_OPTIONS } from '../catalog-search-params'
import type { CatalogFilters, SearchSuggestion } from '../toy-catalog-api'

interface EmptySuggestionsProps {
  filters: CatalogFilters
  suggestions: SearchSuggestion[]
  onChange: (patch: Partial<CatalogFilters>) => void
}

/** Mỗi gợi ý của backend được đổi thành đúng một thay đổi bộ lọc */
function toAction(suggestion: SearchSuggestion, filters: CatalogFilters): { label: string; patch: Partial<CatalogFilters> } {
  switch (suggestion.filter) {
    case 'keyword':
      return {
        label: suggestion.message,
        patch: { q: undefined, sort: filters.sort === 'relevance' ? undefined : filters.sort },
      }
    case 'category':
      return { label: suggestion.message, patch: { categoryId: undefined } }
    case 'type':
      return { label: suggestion.message, patch: { type: undefined } }
    case 'ageRange':
      return { label: suggestion.message, patch: { ageMin: undefined, ageMax: undefined } }
    case 'priceRange':
      return { label: suggestion.message, patch: { minPrice: undefined, maxPrice: undefined } }
    case 'area': {
      const nextRadius = RADIUS_OPTIONS.find((km) => km > (filters.radiusKm ?? 0))
      return nextRadius
        ? { label: `Tăng bán kính lên ${nextRadius} km.`, patch: { radiusKm: nextRadius } }
        : {
            label: 'Bỏ lọc theo khu vực.',
            patch: { lat: undefined, lng: undefined, radiusKm: undefined, sort: filters.sort === 'distance' ? undefined : filters.sort },
          }
    }
  }
}

export function EmptySuggestions({ filters, suggestions, onChange }: EmptySuggestionsProps) {
  // Không có bộ lọc nào mà vẫn rỗng: kho đồ chơi đang trống, nới lọc cũng không giúp được
  if (suggestions.length === 0) {
    return (
      <div className="catalog-empty">
        <h2 className="catalog-empty__title">Chưa có món đồ chơi nào được đăng.</h2>
        <p className="catalog-empty__text">Bạn có đồ chơi con đã chơi xong? Cho thuê hoặc bán lại để món đồ có thêm chủ mới.</p>
        <Link to={PATHS.newListing} className="pl-btn pl-btn--primary">
          Đăng đồ chơi
          <ArrowRight className="pl-btn__arrow" aria-hidden="true" />
        </Link>
      </div>
    )
  }

  return (
    <div className="catalog-empty">
      <h2 className="catalog-empty__title">Chưa có món nào khớp.</h2>
      <p className="catalog-empty__text">Thử nới một vài điều kiện:</p>
      <ul className="catalog-empty__list">
        {suggestions.map((suggestion) => {
          const action = toAction(suggestion, filters)
          return (
            <li key={suggestion.filter}>
              <button type="button" className="catalog-empty__action" onClick={() => onChange(action.patch)}>
                <span>{action.label}</span>
                <ArrowRight className="pl-btn__arrow" aria-hidden="true" />
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
