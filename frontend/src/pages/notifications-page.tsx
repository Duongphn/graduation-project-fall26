import { ChevronRight, Home } from 'lucide-react'
import { useEffect } from 'react'
import { Link } from 'react-router-dom'

import { NotificationsPanel } from '../features/notifications/components/NotificationsPanel'
import { SiteLayout } from '../layouts/site/site-layout'
import { PATHS } from '../routes/paths'

/** Màn hình Thông báo (R03 screen 11): xem mọi thông báo và mở đối tượng liên quan */
export function NotificationsPage() {
  useEffect(() => {
    document.title = 'Thông báo | ToyFlow'
  }, [])

  return (
    <SiteLayout>
      <div className="home-container py-6 sm:py-8">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-tf-ink-muted dark:text-slate-400">
          <Link to={PATHS.home} className="inline-flex items-center gap-1 hover:text-tf-primary dark:hover:text-indigo-300">
            <Home className="size-3.5" aria-hidden /> Trang chủ
          </Link>
          <ChevronRight className="size-3.5" aria-hidden />
          <span aria-current="page" className="font-medium text-tf-ink dark:text-slate-100">
            Thông báo
          </span>
        </nav>
        <h1 className="mt-5 mb-6 text-2xl font-bold text-tf-ink dark:text-slate-100">Thông báo</h1>
        <NotificationsPanel />
      </div>
    </SiteLayout>
  )
}
