import { Heart, LogOut, Package, Plus, UserRound } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { PATHS } from '../../routes/paths'
import { clearAccessToken } from '../../services/token-storage'
import { HeaderPopover } from './header-popover'

/** Ảnh đại diện góc phải header (chỉ hiện khi đã đăng nhập): menu tài khoản */
export function AccountMenu() {
  const navigate = useNavigate()

  return (
    <HeaderPopover
      triggerLabel="Tài khoản của tôi"
      triggerClassName="site-avatar"
      trigger={<UserRound aria-hidden />}
      panelClassName="account-menu"
    >
      {(close) => (
        <nav aria-label="Tài khoản" className="account-menu__links">
          <Link to={PATHS.myListings} className="account-menu__link" onClick={close}>
            <Package aria-hidden /> Tin đăng của tôi
          </Link>
          <Link to={PATHS.newListing} className="account-menu__link" onClick={close}>
            <Plus aria-hidden /> Đăng đồ chơi mới
          </Link>
          <Link to={PATHS.favorites} className="account-menu__link" onClick={close}>
            <Heart aria-hidden /> Yêu thích
          </Link>
          <button
            type="button"
            className="account-menu__link account-menu__link--danger"
            onClick={() => {
              clearAccessToken()
              close()
              navigate(PATHS.home)
            }}
          >
            <LogOut aria-hidden /> Đăng xuất
          </button>
        </nav>
      )}
    </HeaderPopover>
  )
}
