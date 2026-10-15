import { Heart, Menu, Plus, Search, Sparkles } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { ThemeToggle } from '../../components/ui/theme-toggle'
import { useIsSignedIn } from '../../hooks/use-is-signed-in'
import { useScrolledPast } from '../../hooks/use-scrolled-past'
import { AI_ADVISOR_NAV_ITEM, SITE_NAV } from '../../features/home/home-content'
import { browseToysPath, PATHS } from '../../routes/paths'
import { AccountMenu } from './account-menu'
import { HeaderPopover } from './header-popover'
import { NotificationMenu } from './notification-menu'
import { SiteBrand } from './site-brand'
import { SiteMenuDrawer } from './site-menu-drawer'

const navLinkClass = ({ isActive }: { isActive: boolean }) => `site-nav__link ${isActive ? 'is-active' : ''}`

/** Chiều cao header (h-16) — ô tìm kiếm ở trang được coi là "đã khuất" khi trượt xuống dưới header */
const HEADER_HEIGHT_PX = 64

interface SiteHeaderProps {
  revealSearchAfterId?: string
}

/** Header 3 vùng: [menu + logo] · [điều hướng chính, căn giữa] · [tìm kiếm, yêu thích, thông báo, đăng đồ, tài khoản] */
export function SiteHeader({ revealSearchAfterId }: SiteHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const showSearch = useScrolledPast(revealSearchAfterId, HEADER_HEIGHT_PX)
  const isSignedIn = useIsSignedIn()
  const location = useLocation()

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <div className="site-header__start">
          <button
            type="button"
            className="site-header__menu-button"
            aria-label="Mở menu danh mục"
            aria-expanded={menuOpen}
            aria-haspopup="dialog"
            onClick={() => setMenuOpen(true)}
          >
            <Menu aria-hidden />
          </button>
          <SiteBrand />
        </div>

        <nav aria-label="Điều hướng chính" className="site-nav">
          {SITE_NAV.map((item) => (
            <NavLink key={item.label} to={item.to} className={navLinkClass}>
              {item.label}
            </NavLink>
          ))}
          {/* Link có #neo (không dùng NavLink: NavLink coi mọi URL "/" là đang chọn) → trang chủ cuộn tới thẻ AI */}
          <Link to={AI_ADVISOR_NAV_ITEM.to} className="site-nav__link site-nav__link--ai">
            <Sparkles aria-hidden /> {AI_ADVISOR_NAV_ITEM.label}
          </Link>
        </nav>

        <div className="site-header__end">
          <HeaderSearch visible={showSearch} />
          {/* Màn hẹp: ẩn đổi theme và yêu thích (yêu thích vẫn có trong menu tài khoản) */}
          <span className="site-header__optional">
            <ThemeToggle />
          </span>
          <Link to={PATHS.favorites} className="site-icon-button site-header__optional" aria-label="Đồ chơi yêu thích">
            <Heart aria-hidden />
          </Link>
          {/* Thông báo chỉ có nghĩa khi đã đăng nhập (khách đã có nút Đăng nhập) */}
          {isSignedIn && <NotificationMenu />}
          {/* aria-label: màn hẹp chỉ còn dấu + */}
          <Link to={PATHS.newListing} className="site-post-button" aria-label="Đăng đồ chơi">
            <Plus aria-hidden />
            <span aria-hidden>Đăng đồ chơi</span>
          </Link>
          {/* Khách: nút Đăng nhập (đăng nhập xong quay lại đúng trang đang xem); đã đăng nhập: ảnh đại diện + menu */}
          {isSignedIn ? (
            <AccountMenu />
          ) : (
            <Link to={PATHS.login} state={{ from: location.pathname + location.search }} className="site-login-button">
              Đăng nhập
            </Link>
          )}
        </div>
      </div>

      <SiteMenuDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />
    </header>
  )
}

/**
 * Nút kính lúp mở ô tìm kiếm (gọn hơn ô nhập luôn hiện → menu giữa luôn đúng tâm).
 * Trang chủ: ẩn tới khi cuộn qua ô tìm kiếm ở hero; ẩn bằng opacity để header không nhảy, `inert` để không tab tới.
 */
function HeaderSearch({ visible }: { visible: boolean }) {
  return (
    <div className={`site-search ${visible ? '' : 'is-hidden'}`} inert={!visible}>
      <HeaderPopover
        triggerLabel="Tìm đồ chơi"
        triggerClassName="site-icon-button"
        trigger={<Search aria-hidden />}
        panelClassName="search-menu"
      >
        {(close) => <HeaderSearchForm onSubmitted={close} />}
      </HeaderPopover>
    </div>
  )
}

function HeaderSearchForm({ onSubmitted }: { onSubmitted: () => void }) {
  const navigate = useNavigate()
  const inputId = useId()
  const [keyword, setKeyword] = useState('')

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSubmitted()
    navigate(browseToysPath({ q: keyword.trim() }))
  }

  return (
    <form role="search" className="search-menu__form" onSubmit={handleSubmit}>
      <label htmlFor={inputId} className="sr-only">
        Tìm đồ chơi
      </label>
      <input
        id={inputId}
        type="search"
        value={keyword}
        onChange={(event) => setKeyword(event.target.value)}
        placeholder="Tìm đồ chơi, ví dụ: Lego, xe đạp…"
        className="search-menu__input"
        autoComplete="off"
        // Mở hộp tìm kiếm là để gõ ngay
        autoFocus
      />
      <button type="submit" className="home-button home-button--primary home-button--small">
        Tìm
      </button>
    </form>
  )
}
