import { AutoComplete, Checkbox, Select } from 'antd'
import { useState } from 'react'
import type { Category } from '../../toy-listings/toy-listing-api'
import { organizationAgeGroups, VIETNAM_PROVINCES, type AgeGroupKey } from '../constants'
import type { OrganizationFilters } from '../public-queries'

type FilterPatch = Partial<Omit<OrganizationFilters, 'page'>>

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()

/**
 * Ô tỉnh/thành: gợi ý 34 tỉnh, vẫn nhận tỉnh gõ tay (điểm nhận do Admin nhập tự do). Áp dụng khi
 * chọn gợi ý, bấm Enter hoặc rời ô; backend nhận 2–100 ký tự.
 */
function ProvinceFilter({ value, onChange }: { value?: string; onChange: (province?: string) => void }) {
  const [text, setText] = useState(value ?? '')
  const commit = (next: string) => {
    const province = next.trim()
    if (province.length === 1) return
    if ((province || undefined) !== value) onChange(province || undefined)
  }
  const options = VIETNAM_PROVINCES.filter((name) => normalize(name).includes(normalize(text.trim()))).map(
    (name) => ({ value: name }),
  )
  return (
    <AutoComplete
      value={text}
      options={options}
      onChange={setText}
      onSelect={(selected: string) => {
        setText(selected)
        commit(selected)
      }}
      onBlur={() => commit(text)}
      onInputKeyDown={(event) => {
        if (event.key === 'Enter') commit(text)
      }}
      allowClear
      onClear={() => commit('')}
      maxLength={100}
      placeholder="Tất cả tỉnh/thành"
      aria-label="Lọc theo tỉnh/thành của điểm nhận"
      className="w-full"
    />
  )
}

interface OrganizationFiltersBarProps {
  filters: OrganizationFilters
  categories: Category[]
  categoriesLoading: boolean
  onChange: (patch: FilterPatch) => void
}

/** Bộ lọc GB-52 (R03 III.5.2.3 (1)–(4)): tỉnh của điểm nhận, nhóm tuổi, danh mục, chỉ vùng khó khăn */
export function OrganizationFiltersBar({ filters, categories, categoriesLoading, onChange }: OrganizationFiltersBarProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-center">
      {/* key: URL đổi (vd. "Xoá bộ lọc") thì ô gõ lấy lại giá trị mới */}
      <ProvinceFilter key={filters.province ?? ''} value={filters.province} onChange={(province) => onChange({ province })} />
      <Select<AgeGroupKey | ''>
        value={filters.age ?? ''}
        onChange={(age) => onChange({ age: age || undefined })}
        options={[
          { value: '', label: 'Tất cả độ tuổi' },
          ...organizationAgeGroups.map((group) => ({ value: group.key, label: group.label })),
        ]}
        aria-label="Lọc theo nhóm tuổi"
        className="w-full"
      />
      <Select<string>
        value={filters.categoryId ?? ''}
        onChange={(categoryId) => onChange({ categoryId: categoryId || undefined })}
        loading={categoriesLoading}
        showSearch
        optionFilterProp="label"
        options={[
          { value: '', label: 'Tất cả danh mục' },
          ...categories.map((category) => ({ value: category.id, label: category.name })),
        ]}
        aria-label="Lọc theo danh mục đồ chơi"
        className="w-full"
      />
      <Checkbox
        checked={Boolean(filters.remoteOnly)}
        onChange={(event) => onChange({ remoteOnly: event.target.checked || undefined })}
      >
        Chỉ vùng khó khăn
      </Checkbox>
    </div>
  )
}
