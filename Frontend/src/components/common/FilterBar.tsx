import type { ReactNode } from 'react'

interface FilterBarProps {
  children: ReactNode
  // Right-aligned actions, e.g. a "Xoá bộ lọc" button.
  extra?: ReactNode
}

// Row of filters above a list (search box, status select…), wrapping on small screens.
export function FilterBar({ children, extra }: FilterBarProps) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-3">
      {children}
      {extra && <div className="ml-auto flex flex-wrap gap-2">{extra}</div>}
    </div>
  )
}
