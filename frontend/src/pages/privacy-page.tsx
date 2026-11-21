import { LegalDocumentView } from '../features/legal/components/legal-document-view'
import { PRIVACY_POLICY } from '../features/legal/legal-content'
import { PATHS } from '../routes/paths'

/** Chính sách bảo mật (R03 1.1.1 (8)): công khai, mở từ form đăng ký (tab mới) và footer */
export function PrivacyPage() {
  return <LegalDocumentView document={PRIVACY_POLICY} related={{ label: 'Điều khoản dịch vụ', to: PATHS.terms }} />
}
