import { Mountain } from 'lucide-react'
import { ageGroupLabel } from '../constants'
import type { PublicOrganization } from '../types'

/** Huy hiệu "Vùng khó khăn": tổ chức được Admin đánh dấu phục vụ vùng nghèo, vùng sâu (GB-53) */
export function RemoteAreaBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
      <Mountain className="size-3.5" aria-hidden /> Vùng khó khăn
    </span>
  )
}

const chipClass = 'rounded-md bg-tf-surface px-2 py-0.5 text-xs font-medium text-tf-ink'

/**
 * Nhu cầu của tổ chức (GB-53, R03 III.5.2.3 (6)): nhóm tuổi nhận, danh mục nhận, tỉnh của điểm nhận
 * và khu vực hỗ trợ. Danh mục đã bị ẩn không còn trong GET /categories nên không hiện.
 */
export function OrganizationNeeds({
  organization,
  categoryNames,
}: {
  organization: PublicOrganization
  categoryNames: ReadonlyMap<string, string>
}) {
  const categories = organization.categoryIds
    .map((id) => categoryNames.get(id))
    .filter((name): name is string => Boolean(name))
  const province = organization.receivingPoint?.province
  const area = organization.areaProvince ?? province

  return (
    <dl className="flex flex-col gap-1.5 text-sm leading-6">
      {organization.ageGroups.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <dt className="font-semibold text-tf-ink">Nhóm tuổi:</dt>
          {organization.ageGroups.map((group) => (
            <dd key={`${group.minAge}-${group.maxAge}`} className={chipClass}>
              {ageGroupLabel(group)}
            </dd>
          ))}
        </div>
      )}
      {categories.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <dt className="font-semibold text-tf-ink">Danh mục nhận:</dt>
          {categories.map((name) => (
            <dd key={name} className={chipClass}>
              {name}
            </dd>
          ))}
        </div>
      )}
      {province && (
        <div className="flex flex-wrap gap-1.5">
          <dt className="font-semibold text-tf-ink">Điểm nhận tại:</dt>
          <dd className="text-tf-ink">{province}</dd>
        </div>
      )}
      {area && (
        <div className="flex flex-wrap gap-1.5">
          <dt className="font-semibold text-tf-ink">Khu vực hỗ trợ:</dt>
          <dd className="text-tf-ink">{area}</dd>
        </div>
      )}
    </dl>
  )
}
