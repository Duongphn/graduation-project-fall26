import { Info, Loader2, Upload, X } from 'lucide-react'
import type { ReactNode } from 'react'

interface ListingPublishPanelProps {
  isEdit: boolean
  /** Ghi chú kiểm duyệt cho tin đang sửa (vd. lý do từ chối, hoặc lưu xong tin chờ duyệt lại) */
  reviewNotice?: ReactNode
  /** Nhãn nút lưu khi sửa, mặc định "Lưu thay đổi" */
  saveLabel?: string
  isSaving: boolean
  /** Lỗi từ backend (đã dịch), kèm hành động khắc phục nếu có (vd. link đăng nhập) */
  error?: { message: string; action?: ReactNode }
  onDiscard: () => void
}

export function ListingPublishPanel({
  isEdit,
  reviewNotice,
  saveLabel = 'Lưu thay đổi',
  isSaving,
  error,
  onDiscard,
}: ListingPublishPanelProps) {
  return (
    <section className="tf-card tf-card--side">
      {!isEdit && (
        <div className="publish-info">
          <Info aria-hidden />
          <p>
            Tin đăng mới sẽ ở trạng thái <strong>Chờ duyệt</strong> cho đến khi Quản trị viên phê duyệt.
          </p>
        </div>
      )}

      {isEdit && reviewNotice && (
        <div className="publish-info">
          <Info aria-hidden />
          <p>{reviewNotice}</p>
        </div>
      )}

      {error && (
        <div className="publish-error" role="alert">
          <p>{error.message}</p>
          {error.action}
        </div>
      )}

      <div className="publish-actions">
        <button type="submit" className="tf-btn tf-btn--primary" disabled={isSaving}>
          {isSaving ? <Loader2 aria-hidden className="animate-spin" /> : <Upload aria-hidden />}
          {isSaving ? 'Đang lưu...' : isEdit ? saveLabel : 'Đăng tin'}
        </button>
        <button type="button" className="tf-btn tf-btn--ghost" onClick={onDiscard} disabled={isSaving}>
          <X aria-hidden />
          Hủy thay đổi
        </button>
      </div>
    </section>
  )
}
