import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'

interface FilterDrawerProps {
  open: boolean
  onClose: () => void
  children: ReactNode
}

/**
 * Drawer bộ lọc trên màn hẹp, dựng bằng <dialog> gốc: tự giữ focus bên trong, Esc để đóng,
 * phần nền phía sau trơ. Nội dung là FilterPanel, nút "Áp dụng" của panel đóng luôn drawer.
 */
export function FilterDrawer({ open, onClose, children }: FilterDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      className="filter-drawer"
      aria-label="Bộ lọc"
      onClose={onClose}
      // Bấm vào vùng nền mờ (chính phần tử dialog, ngoài panel) thì đóng
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="filter-drawer__panel">
        <button type="button" className="filter-drawer__close" aria-label="Đóng bộ lọc" onClick={onClose}>
          <X aria-hidden="true" />
        </button>
        {children}
      </div>
    </dialog>
  )
}
