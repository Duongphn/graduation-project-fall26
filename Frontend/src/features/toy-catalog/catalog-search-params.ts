import { formatVnd } from '../toy-listings/format-vnd'
import type { Category } from '../toy-listings/toy-listing-api'
import { AGE_OPTIONS } from '../toy-listings/toy-listing-schema'
import type { CatalogFilters, CatalogSort, ToyCard } from './toy-catalog-api'
import { CATALOG_PAGE_SIZE, PAGE_SIZE_OPTIONS } from './toy-catalog-queries'

/**
 * Bộ lọc nằm trên URL (?q=&type=&page=…) để chia sẻ link và nút Back hoạt động đúng.
 * Giá trị sai trên URL bị bỏ qua thay vì gửi lên để backend trả 400.
 */

export const SORT_LABELS: Record<CatalogSort, string> = {
  relevance: 'Liên quan nhất',
  newest: 'Mới đăng',
  price_asc: 'Giá thấp đến cao',
  price_desc: 'Giá cao đến thấp',
  distance: 'Gần tôi nhất',
}

/** Backend giới hạn bán kính tối đa 100 km */
export const RADIUS_OPTIONS = [2, 5, 10, 25, 50, 100] as const
export const DEFAULT_RADIUS_KM = 5

const OBJECT_ID_REGEX = /^[a-f\d]{24}$/i

function readNumber(params: URLSearchParams, key: string, min: number, max: number): number | undefined {
  const raw = params.get(key)
  if (raw === null || raw.trim() === '') return undefined
  const value = Number(raw)
  return Number.isFinite(value) && value >= min && value <= max ? value : undefined
}

function readInteger(params: URLSearchParams, key: string, min: number): number | undefined {
  const value = readNumber(params, key, min, Number.MAX_SAFE_INTEGER)
  return value !== undefined && Number.isInteger(value) ? value : undefined
}

export function parseCatalogSearch(params: URLSearchParams): CatalogFilters {
  const q = params.get('q')?.trim() || undefined
  const rawType = params.get('type')
  const type = rawType === 'rent' || rawType === 'sell' ? rawType : undefined
  const rawCategory = params.get('categoryId') ?? ''
  const categoryId = OBJECT_ID_REGEX.test(rawCategory) ? rawCategory : undefined

  let ageMin = readInteger(params, 'ageMin', 0)
  let ageMax = readInteger(params, 'ageMax', 0)
  if (ageMin !== undefined && ageMax !== undefined && ageMin > ageMax) ageMin = ageMax = undefined

  let minPrice = readNumber(params, 'minPrice', 0, Number.MAX_SAFE_INTEGER)
  let maxPrice = readNumber(params, 'maxPrice', 0, Number.MAX_SAFE_INTEGER)
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) minPrice = maxPrice = undefined

  // Lọc khu vực cần đủ cả ba giá trị
  let lat = readNumber(params, 'lat', -90, 90)
  let lng = readNumber(params, 'lng', -180, 180)
  let radiusKm = readNumber(params, 'radiusKm', 0.1, 100)
  if (lat === undefined || lng === undefined || radiusKm === undefined) lat = lng = radiusKm = undefined

  const rawSort = params.get('sort') as CatalogSort | null
  let sort = rawSort && rawSort in SORT_LABELS ? rawSort : undefined
  if (sort === 'distance' && lat === undefined) sort = undefined
  if (sort === 'relevance' && !q) sort = undefined

  return {
    q,
    type,
    categoryId,
    ageMin,
    ageMax,
    minPrice,
    maxPrice,
    lat,
    lng,
    radiusKm,
    sort,
    page: readInteger(params, 'page', 1) ?? 1,
    limit: PAGE_SIZE_OPTIONS.find((size) => size === readInteger(params, 'limit', 1)),
  }
}

export function toCatalogSearch(filters: CatalogFilters): URLSearchParams {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === '') continue
    if (key === 'page' && value === 1) continue
    if (key === 'limit' && value === CATALOG_PAGE_SIZE) continue
    params.set(key, String(value))
  }
  return params
}

/** Sắp xếp mặc định của backend: có từ khoá thì theo độ phù hợp, không thì mới nhất */
export const effectiveSort = (filters: CatalogFilters): CatalogSort =>
  filters.sort ?? (filters.q ? 'relevance' : 'newest')

export const hasLocation = (filters: CatalogFilters) => filters.lat !== undefined && filters.radiusKm !== undefined

/** Patch xoá các điều kiện trong panel Bộ lọc; giữ từ khoá và loại tin (hai thứ này nằm ở thanh công cụ) */
export const CLEARED_FILTERS: Partial<CatalogFilters> = {
  categoryId: undefined,
  ageMin: undefined,
  ageMax: undefined,
  minPrice: undefined,
  maxPrice: undefined,
  lat: undefined,
  lng: undefined,
  radiusKm: undefined,
  sort: undefined,
}

export function countActiveFilters(filters: CatalogFilters): number {
  // Chỉ đếm điều kiện trong panel Bộ lọc (số trên nút mở drawer); loại tin đã hiện ở tab
  return [
    filters.categoryId,
    filters.ageMin ?? filters.ageMax,
    filters.minPrice ?? filters.maxPrice,
    filters.radiusKm,
  ].filter((value) => value !== undefined).length
}

export function findAgeOptionIndex(filters: CatalogFilters): number {
  return AGE_OPTIONS.findIndex((option) => option.minAge === filters.ageMin && option.maxAge === filters.ageMax)
}

/** Nhãn ngắn cho khoảng giá bất kỳ (kể cả khoảng không nằm trong danh sách gợi ý) */
export function describePriceRange(filters: CatalogFilters): string {
  if (filters.minPrice !== undefined && filters.maxPrice !== undefined) {
    return `${formatVnd(filters.minPrice)} – ${formatVnd(filters.maxPrice)}`
  }
  return filters.minPrice !== undefined ? `Từ ${formatVnd(filters.minPrice)}` : `Đến ${formatVnd(filters.maxPrice ?? 0)}`
}

export function formatAgeRange({ minAge, maxAge }: ToyCard['ageRange']): string {
  if (minAge === 0 && maxAge <= 1) return '0–12 tháng'
  if (maxAge >= 99) return `Từ ${minAge} tuổi`
  return `${minAge}–${maxAge} tuổi`
}

export function formatToyPrice(toy: Pick<ToyCard, 'listingType' | 'priceOrRate'>): string {
  return toy.listingType === 'rent' ? `${formatVnd(toy.priceOrRate)} / ngày` : formatVnd(toy.priceOrRate)
}

/** Khoảng cách đường chim bay (km) từ vị trí đang lọc tới món đồ; không đủ toạ độ thì trả undefined */
export function distanceFromFilter(filters: CatalogFilters, toy: Pick<ToyCard, 'location'>): number | undefined {
  const coordinates = toy.location?.coordinates
  if (filters.lat === undefined || filters.lng === undefined || !coordinates) return undefined
  const [lng, lat] = coordinates
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat - filters.lat)
  const dLng = toRad(lng - filters.lng)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(filters.lat)) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(a))
}

const relativeFormatter = new Intl.RelativeTimeFormat('vi', { numeric: 'auto' })

/** "hôm nay", "3 ngày trước", "2 tháng trước" */
export function formatPostedAgo(iso: string, now = Date.now()): string {
  const days = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 86_400_000))
  let text: string
  if (days < 30) text = relativeFormatter.format(-days, 'day')
  else if (days < 365) text = relativeFormatter.format(-Math.floor(days / 30), 'month')
  else text = relativeFormatter.format(-Math.floor(days / 365), 'year')
  // Intl trả "Hôm qua"/"Hôm nay" viết hoa; chuỗi này luôn đứng giữa câu ("Đăng hôm qua")
  return text.toLocaleLowerCase('vi')
}

/** Danh mục con xếp ngay dưới danh mục cha, thụt lề để thấy quan hệ cha con */
export function orderCategories(categories: Category[]): Array<{ category: Category; depth: number }> {
  const byName = (a: Category, b: Category) => a.name.localeCompare(b.name, 'vi')
  const roots = categories.filter((c) => !c.parentId || !categories.some((p) => p.id === c.parentId)).sort(byName)
  return roots.flatMap((root) => [
    { category: root, depth: 0 },
    ...categories
      .filter((c) => c.parentId === root.id)
      .sort(byName)
      .map((child) => ({ category: child, depth: 1 })),
  ])
}
