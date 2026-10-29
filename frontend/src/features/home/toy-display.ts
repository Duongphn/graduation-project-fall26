import type { ToyListing } from '../toy-listings/toy-listing-api'

/** Backend lưu tuổi theo năm; maxAge ≥ 99 nghĩa là "không giới hạn" (xem AGE_OPTIONS) */
const OPEN_ENDED_AGE = 99

/** { minAge: 4, maxAge: 8 } → "4–8 tuổi"; { minAge: 12, maxAge: 99 } → "12+ tuổi" */
export function formatAgeRange({ minAge, maxAge }: ToyListing['ageRange']): string {
  if (maxAge >= OPEN_ENDED_AGE) return `${minAge}+ tuổi`
  if (minAge === maxAge) return `${minAge} tuổi`
  return `${minAge}–${maxAge} tuổi`
}

/** "Như mới (90–99%)" → "Như mới" — bản rút gọn cho thẻ sản phẩm */
export const shortCondition = (condition: string) => condition.replace(/\s*\(.*\)\s*$/, '').trim()
