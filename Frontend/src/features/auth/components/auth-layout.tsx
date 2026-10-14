import { ArrowLeftOutlined } from '@ant-design/icons'
import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AuthBrandPanel, type AuthBrandPanelProps } from './auth-brand-panel'
import { BrandLogo } from '../../../components/ui/brand-logo'
import { ThemeToggle } from '../../../components/ui/theme-toggle'
import { PATHS } from '../../../routes/paths'

interface AuthLayoutProps {
  /** Tiêu đề tab trình duyệt (không kèm hậu tố " - ToyFlow") */
  pageTitle: string
  brand: AuthBrandPanelProps
  children: ReactNode
}

export function AuthLayout({ pageTitle, brand, children }: AuthLayoutProps) {
  useEffect(() => {
    document.title = `${pageTitle} - ToyFlow`
  }, [pageTitle])

  return (
    <div className="auth-layout">
      <AuthBrandPanel {...brand} />

      <main className="auth-panel">
        <nav className="auth-panel__nav">
          <Link to={PATHS.home} className="auth-panel__back-link">
            <ArrowLeftOutlined aria-hidden />
            Về trang chủ
          </Link>
          <ThemeToggle />
        </nav>

        <div className="auth-panel__content">
          <div className="auth-panel__mobile-logo">
            <BrandLogo surface="light-surface" />
          </div>
          {children}
        </div>

        <footer className="auth-panel__footer">© 2026 ToyFlow · Thuê, mua lại và quyên góp đồ chơi trẻ em</footer>
      </main>
    </div>
  )
}
