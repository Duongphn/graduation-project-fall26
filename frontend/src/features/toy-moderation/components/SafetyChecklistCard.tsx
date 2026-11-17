import { Card, Checkbox, Typography } from 'antd'

import { safetyChecklistItems, type SafetyChecklistKey } from '../constants'

interface SafetyChecklistCardProps {
  // The ticked items.
  value: SafetyChecklistKey[]
  onChange?: (value: SafetyChecklistKey[]) => void
  // A decided post shows the stored ticks read-only.
  readOnly?: boolean
}

// The Admin safety checklist (UC27, GB-48). Approve stays disabled until every item is ticked;
// the ticks are sent with the approval and stored with the moderation record.
export function SafetyChecklistCard({ value, onChange, readOnly }: SafetyChecklistCardProps) {
  return (
    <Card title="Kiểm tra an toàn">
      {!readOnly && (
        <Typography.Paragraph type="secondary">
          So sánh ảnh với thông tin an toàn người đăng khai báo. Phải đánh dấu đủ các mục mới duyệt
          được tin; từ chối thì không cần.
        </Typography.Paragraph>
      )}
      <Checkbox.Group<SafetyChecklistKey>
        className="flex flex-col gap-2"
        value={value}
        disabled={readOnly}
        onChange={(checked) => onChange?.(checked)}
        options={safetyChecklistItems.map((item) => ({ value: item.key, label: item.label }))}
      />
    </Card>
  )
}
