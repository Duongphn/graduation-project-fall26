import { ageGroupLabels } from '../../../constants/labels'
import type { AgeGroup } from '../../../constants/domain'

/** Các nhóm tuổi tổ chức tiếp nhận, dạng nhãn nhỏ */
export function AgeGroupChips({ ageGroups }: { ageGroups: AgeGroup[] }) {
  if (ageGroups.length === 0) return <span className="text-xs text-tf-ink-muted">Chưa cập nhật</span>

  return (
    <ul className="flex flex-wrap gap-1.5">
      {ageGroups.map((group) => (
        <li key={group} className="rounded-md bg-tf-primary-fixed px-2 py-0.5 text-xs font-semibold text-tf-primary">
          {ageGroupLabels[group]}
        </li>
      ))}
    </ul>
  )
}
