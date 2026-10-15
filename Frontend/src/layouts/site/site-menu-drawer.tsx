import { useQuery } from '@tanstack/react-query'
import { Drawer } from 'antd'
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { homeCategoriesQuery, selectRootCategories } from '../../features/home/home-queries'
import { browseToysPath } from '../../routes/paths'
import { SiteBrand } from './site-brand'

interface SiteMenuDrawerProps {
  open: boolean
  onClose: () => void
}

const SKELETON_COUNT = 6

/** Menu trượt từ trái (nút 3 gạch): danh mục đồ chơi lấy từ API */
export function SiteMenuDrawer({ open, onClose }: SiteMenuDrawerProps) {
  const categories = useQuery({ ...homeCategoriesQuery, select: selectRootCategories })

  return (
    <Drawer open={open} onClose={onClose} placement="left" title={<SiteBrand />} className="site-menu">
      <nav aria-labelledby="site-menu-categories" className="site-menu__section">
        <h2 id="site-menu-categories" className="site-menu__heading">
          Danh mục đồ chơi
        </h2>

        {categories.isPending && (
          <div className="site-menu__list" aria-busy="true">
            {Array.from({ length: SKELETON_COUNT }, (_, index) => (
              <span key={index} className="site-menu__skeleton home-skeleton" aria-hidden />
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
                <Link to={browseToysPath({ category: category.slug })} className="site-menu__category" onClick={onClose}>
                  <span className="site-menu__category-name">{category.name}</span>
                  <ChevronRight className="site-menu__chevron" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}

        <Link to={browseToysPath()} className="home-link site-menu__all" onClick={onClose}>
          Xem tất cả đồ chơi
        </Link>
      </nav>

    </Drawer>
  )
}
