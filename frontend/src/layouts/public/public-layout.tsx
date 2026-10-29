import type { ReactNode } from 'react'
import { PublicHeader } from './public-header'

/** Khung cho các trang công khai (khách chưa đăng nhập vẫn xem được): header ngang + footer mảnh */
export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="public-layout">
      <a href="#noi-dung" className="pl-skip">
        Bỏ qua, tới nội dung chính
      </a>

      <PublicHeader />

      <main id="noi-dung" className="pl-main">
        {children}
      </main>

      <footer className="pl-footer">
        <div className="pl-container pl-footer__inner">
          <span>© {new Date().getFullYear()} ToyFlow</span>
          <span>Thuê, mua lại và quyên góp đồ chơi giữa các gia đình.</span>
        </div>
      </footer>
    </div>
  )
}
