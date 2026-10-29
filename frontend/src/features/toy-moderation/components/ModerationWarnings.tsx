import { Alert } from 'antd'

import type { ModerationWarning } from '../types'

// Rule-based warnings from the backend (hidden category, owner not verified or under age, contact
// details in the text, too few photos). They only help: the Admin decides (LI-03).
export function ModerationWarnings({ warnings }: { warnings: ModerationWarning[] }) {
  if (warnings.length === 0) {
    return (
      <Alert
        type="success"
        showIcon
        title="Không phát hiện vấn đề theo các quy tắc kiểm tra tự động."
        description="Admin vẫn cần tự xem ảnh và mô tả trước khi duyệt."
      />
    )
  }
  return (
    <div className="flex flex-col gap-2">
      {warnings.map((warning) => (
        <Alert key={warning.code} type="warning" showIcon title={warning.message} />
      ))}
    </div>
  )
}
