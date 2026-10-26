import type { ReactNode } from 'react'
import { SiteFooter } from './site-footer'
import { SiteHeader } from './site-header'

interface SiteLayoutProps {
  children: ReactNode
  /** Trang có ô tìm kiếm riêng (vd. hero trang chủ): header chỉ hiện ô tìm kiếm khi đã cuộn qua phần tử có id này */
  revealHeaderSearchAfterId?: string
}

/** Khung các trang công khai: header dính trên cùng, nội dung, footer */
export function SiteLayout({ children, revealHeaderSearchAfterId }: SiteLayoutProps) {
  return (
    <div className="site-layout">
      <a href="#main-content" className="site-skip-link">
        Bỏ qua đến nội dung chính
      </a>
      <SiteHeader revealSearchAfterId={revealHeaderSearchAfterId} />
      <main id="main-content" className="site-main">
        {children}
      </main>
      <SiteFooter />
    </div>
  )
}
