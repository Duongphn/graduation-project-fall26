import type { ReactNode } from 'react'
import { AppSidebar, SessionButton, SidebarBrand, type SidebarItemKey } from '../../components/ui/app-sidebar'
import { ThemeToggle } from '../../components/ui/theme-toggle'

interface AccountLayoutProps {
  activeItem: SidebarItemKey
  children: ReactNode
}

/** Khung trang tài khoản: sidebar cố định (desktop), thanh trên cùng thay sidebar (mobile/tablet) */
export function AccountLayout({ activeItem, children }: AccountLayoutProps) {
  return (
    <div className="account-layout">
      <AppSidebar activeKey={activeItem} />

      <div className="account-main">
        <header className="account-topbar">
          <SidebarBrand />
          <div className="account-topbar__actions">
            <ThemeToggle />
            <SessionButton />
          </div>
        </header>
        <main className="account-content">{children}</main>
      </div>
    </div>
  )
}
