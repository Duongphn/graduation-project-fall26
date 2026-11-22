import { useQuery } from '@tanstack/react-query'
import { Drawer } from 'antd'
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { SITE_NAV } from '../../features/home/home-content'
import { homeCategoriesQuery, selectRootCategories } from '../../features/home/home-queries'
import { browseToysPath, PATHS } from '../../routes/paths'
import { SiteBrand } from './site-brand'

interface SiteMenuDrawerProps {
  open: boolean
  onClose: () => void
}

const SKELETON_COUNT = 6

/** Màn hẹp không có menu chính ở header: đưa các mục chính và trang tổ chức từ thiện vào đây */
const MAIN_LINKS = [...SITE_NAV, { label: 'Tổ chức từ thiện', to: PATHS.charityOrganizations }]

/** Menu trượt từ trái (nút 3 gạch): mục chính (thuê, mua lại, quyên góp, tổ chức) và danh mục đồ chơi lấy từ API */
export function SiteMenuDrawer({ open, onClose }: SiteMenuDrawerProps) {
  const categories = useQuery({ ...homeCategoriesQuery, select: selectRootCategories })

  return (
    <Drawer open={open} onClose={onClose} placement="left" title={<SiteBrand />} className="site-menu">
      <nav aria-labelledby="site-menu-main" className="site-menu__section">
        <h2 id="site-menu-main" className="site-menu__heading">
          Khám phá
        </h2>
        <ul className="site-menu__list">
          {MAIN_LINKS.map((item) => (
            <li key={item.label}>
              <Link to={item.to} className="site-menu__category" onClick={onClose}>
                <span className="site-menu__category-name">{item.label}</span>
                <ChevronRight className="site-menu__chevron" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <nav aria-labelledby="site-menu-categories" className="site-menu__section">
        <h2 id="site-menu-categories" className="site-menu__heading">
          Danh mục đồ chơi
        </h2>

        {categories.isPending && (
          <div className="site-menu__list" aria-busy="true">
            {Array.from({ length: SKELETON_COUNT }, (_, index) => (
              <span key={index} className="site-menu__skeleton animate-pulse rounded-2xl bg-tf-surface/70 dark:bg-night-800" aria-hidden />
            ))}
          </div>
        )}

        {categories.isError && (
          <p className="site-menu__note">
            Chưa tải được danh mục.{' '}
            <button type="button" className="site-menu__retry" onClick={() => void categories.refetch()}>
              Thử lại
            </button>
          </p>
        )}

        {categories.isSuccess && (
          <ul className="site-menu__list">
            {categories.data.map((category) => (
              <li key={category.id}>
                <Link to={browseToysPath({ categoryId: category.id })} className="site-menu__category" onClick={onClose}>
                  <span className="site-menu__category-name">{category.name}</span>
                  <ChevronRight className="site-menu__chevron" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}

        <Link to={browseToysPath()} className="site-menu__all inline-flex shrink-0 items-center gap-1 rounded text-sm font-semibold text-site-primary hover:underline focus-ring dark:text-indigo-300 [&_svg]:size-4 [&_svg]:transition-transform [&_svg]:duration-300 [&_svg]:ease-out-quint hover:[&_svg]:translate-x-0.5" onClick={onClose}>
          Xem tất cả đồ chơi
        </Link>
      </nav>

    </Drawer>
  )
}
