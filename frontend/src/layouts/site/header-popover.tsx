import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

interface HeaderPopoverProps {
  /** Nội dung nút mở (icon / avatar) */
  trigger: ReactNode
  triggerLabel: string
  triggerClassName: string
  /** Nhận hàm đóng để link/nút bên trong tự đóng popover sau khi bấm */
  children: (close: () => void) => ReactNode
  panelClassName?: string
}

/** Hộp bật lên dưới nút trên header: đóng khi bấm ra ngoài hoặc nhấn Esc, trả focus về nút */
export function HeaderPopover({ trigger, triggerLabel, triggerClassName, children, panelClassName = '' }: HeaderPopoverProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const close = () => setOpen(false)

  return (
    <div ref={rootRef} className="header-popover">
      <button
        ref={buttonRef}
        type="button"
        className={triggerClassName}
        aria-label={triggerLabel}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        {trigger}
      </button>
      {open && (
        <div id={panelId} className={`header-popover__panel ${panelClassName}`} role="dialog" aria-label={triggerLabel}>
          {children(close)}
        </div>
      )}
    </div>
  )
}
