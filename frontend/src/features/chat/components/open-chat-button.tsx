import { LoaderCircle, MessageCircle } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'

import { useIsSignedIn } from '../../../hooks/use-is-signed-in'
import { PATHS } from '../../../routes/paths'
import type { ChatSubjectKind } from '../chat-api'
import { useOpenConversation } from '../chat-queries'

interface OpenChatButtonProps {
  kind: ChatSubjectKind
  /** Mã tin đăng hoặc mã đơn */
  id: string
  className?: string
  label?: string
}

/**
 * Nút "Nhắn tin": mở (hoặc tạo) phòng về tin đăng / đơn rồi chuyển tới phòng. Khách được đưa tới
 * trang đăng nhập và quay lại đúng trang này. Lỗi (tin đã ẩn, chat với chính mình, không thuộc
 * đơn…) hiện bằng thông báo của máy chủ.
 */
export function OpenChatButton({ kind, id, className = 'tf-btn tf-btn--soft tf-btn--inline', label = 'Nhắn tin' }: OpenChatButtonProps) {
  const isSignedIn = useIsSignedIn()
  const navigate = useNavigate()
  const location = useLocation()
  const open = useOpenConversation()

  const handleClick = () => {
    if (!isSignedIn) {
      navigate(PATHS.login, { state: { from: location.pathname + location.search } })
      return
    }
    open.mutate({ kind, id })
  }

  return (
    <button type="button" className={className} onClick={handleClick} disabled={open.isPending} aria-busy={open.isPending}>
      {open.isPending ? <LoaderCircle aria-hidden className="animate-spin" /> : <MessageCircle aria-hidden />}
      {label}
    </button>
  )
}
