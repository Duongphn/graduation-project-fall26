import { Select } from 'antd'
import type { SelectProps } from 'antd'

import { provinceOptions } from '../../constants/provinces'
import type { VietnamProvince } from '../../constants/provinces'
import { matchesWithoutTones } from '../../utils/text'

type ProvinceSelectProps = Omit<
  SelectProps<VietnamProvince>,
  'options' | 'showSearch' | 'mode' | 'filterOption'
>

// Searchable select of the 34 provinces (src/constants/provinces.ts); "ha noi" finds "Hà Nội".
export function ProvinceSelect({
  placeholder = 'Chọn tỉnh/thành phố',
  ...props
}: ProvinceSelectProps) {
  return (
    <Select<VietnamProvince>
      {...props}
      placeholder={placeholder}
      options={provinceOptions}
      showSearch={{ filterOption: (input, option) => matchesWithoutTones(input, option?.label) }}
    />
  )
}
