import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface DialogBehaviorOptions {
  onClose: () => void
  /** Đang gửi yêu cầu: Esc không đóng */
  busy: boolean
}

/**
 * Hành vi của hộp thoại modal: focus ô nhập đầu tiên khi mở, giữ Tab trong hộp thoại, Esc để đóng,
 * khoá cuộn trang nền, đóng xong trả focus về nút đã mở hộp thoại.
 */
export function useDialogBehavior(panelRef: RefObject<HTMLElement | null>, { onClose, busy }: DialogBehaviorOptions) {
  // Giá trị mới nhất cho trình nghe phím, không phải gắn lại listener mỗi lần render
  const latest = useRef({ onClose, busy })
  useEffect(() => {
    latest.current = { onClose, busy }
  })

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusables = () => Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))

    const firstField = panel.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled])')
    ;(firstField ?? focusables()[0])?.focus()

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!latest.current.busy) latest.current.onClose()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (!panel.contains(active)) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      opener?.focus()
    }
  }, [panelRef])
}
