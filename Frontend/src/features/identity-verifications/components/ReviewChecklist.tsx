import { Checkbox, Typography } from 'antd'

import { identityChecklist } from '../constants'

interface ReviewChecklistProps {
  value: string[]
  onChange: (value: string[]) => void
  disabled?: boolean
}

// Reminder of what to check before deciding. A visual aid only: it is not sent or stored.
export function ReviewChecklist({ value, onChange, disabled }: ReviewChecklistProps) {
  return (
    <div className="flex flex-col gap-2">
      <Typography.Text type="secondary">
        Đánh dấu các mục đã kiểm tra (chỉ để hỗ trợ, không lưu lại):
      </Typography.Text>
      <Checkbox.Group
        className="flex flex-col gap-2"
        value={value}
        disabled={disabled}
        onChange={(checked) => onChange(checked.map(String))}
        options={identityChecklist.map((item) => ({ value: item.value, label: item.label }))}
      />
    </div>
  )
}
