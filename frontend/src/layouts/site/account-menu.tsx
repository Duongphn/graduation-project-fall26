import {
  Bell,
  CalendarCheck,
  Gift,
  HandHeart,
  Heart,
  IdCard,
  LayoutDashboard,
  LogOut,
  Package,
  Plus,
  ReceiptText,
  ShieldCheck,
  UserRound,
  Wallet,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { ADMIN_ROOT, PATHS } from '../../routes/paths'
import { getCurrentRole } from '../../services/current-role'
import { logout } from '../../features/auth/auth-api'
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
          {/* Admin đang xem trang người dùng: lối về khu quản trị */}
          {getCurrentRole() === 'ADMIN' && (
            <Link to={ADMIN_ROOT} className="account-menu__link" onClick={close}>
              <LayoutDashboard aria-hidden /> Quản trị
            </Link>
          )}
          {/* R03 UC03/UC04/UC26: hồ sơ, xác minh danh tính và thông báo mở từ menu tài khoản */}
          <Link to={PATHS.profile} className="account-menu__link" onClick={close}>
            <IdCard aria-hidden /> Hồ sơ của tôi
          </Link>
          <Link to={PATHS.identityVerification} className="account-menu__link" onClick={close}>
            <ShieldCheck aria-hidden /> Xác minh danh tính
          </Link>
          <Link to={PATHS.notifications} className="account-menu__link" onClick={close}>
            <Bell aria-hidden /> Thông báo
          </Link>
          <Link to={PATHS.myListings} className="account-menu__link" onClick={close}>
            <Package aria-hidden /> Tin đăng của tôi
          </Link>
          <Link to={PATHS.newListing} className="account-menu__link" onClick={close}>
            <Plus aria-hidden /> Đăng đồ chơi mới
          </Link>
          <Link to={PATHS.myDonations} className="account-menu__link" onClick={close}>
            <HandHeart aria-hidden /> Quyên góp của tôi
          </Link>
          <Link to={PATHS.myDonationRequests} className="account-menu__link" onClick={close}>
            <Gift aria-hidden /> Yêu cầu nhận đồ của tôi
          </Link>
          <Link to={PATHS.myRentals} className="account-menu__link" onClick={close}>
            <CalendarCheck aria-hidden /> Đơn thuê của tôi
          </Link>
          <Link to={PATHS.rentalRequests} className="account-menu__link" onClick={close}>
            <ReceiptText aria-hidden /> Yêu cầu thuê nhận được
          </Link>
          <Link to={PATHS.wallet} className="account-menu__link" onClick={close}>
            <Wallet aria-hidden /> Ví ToyFlow
          </Link>
          <Link to={PATHS.favorites} className="account-menu__link" onClick={close}>
            <Heart aria-hidden /> Yêu thích
          </Link>
          <button
            type="button"
            className="account-menu__link account-menu__link--danger"
            onClick={() => {
              close()
              void logout().then(() => navigate(PATHS.home))
            }}
          >
            <LogOut aria-hidden /> Đăng xuất
          </button>
        </nav>
      )}
    </HeaderPopover>
  )
}
