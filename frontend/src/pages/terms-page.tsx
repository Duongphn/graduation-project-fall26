import { LegalDocumentView } from '../features/legal/components/legal-document-view'
import { TERMS_OF_SERVICE } from '../features/legal/legal-content'
import { PATHS } from '../routes/paths'

/** Điều khoản dịch vụ (R03 1.1.1 (8)): công khai, mở từ form đăng ký (tab mới) và footer */
export function TermsPage() {
  return <LegalDocumentView document={TERMS_OF_SERVICE} related={{ label: 'Chính sách bảo mật', to: PATHS.privacy }} />
}
