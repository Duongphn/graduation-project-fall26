import {
  CircleUserRound,
  HandHeart,
  Heart,
  KeyRound,
  LogIn,
  LogOut,
  Package,
  ReceiptText,
  Search,
  Star,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import brandMark from "../../assets/brand/toyflow-mark.png";
import brandWordmark from "../../assets/brand/toyflow-wordmark.png";
import { PATHS } from "../../routes/paths";
import { clearAuthTokens, getAccessToken } from "../../services/token-storage";

export type SidebarItemKey =
  | "browse"
  | "donations"
  | "profile"
  | "listings"
  | "rentals"
  | "wallet"
  | "favorites"
  | "reviews"
  | "password";

interface SidebarItem {
  key: SidebarItemKey;
  label: string;
  icon: LucideIcon;
  /** Chưa có trang thì để trống — mục vẫn hiển thị nhưng chưa điều hướng */
  to?: string;
}

/** Menu chung của mọi trang tài khoản — thêm `to` khi trang tương ứng được xây */
const SIDEBAR_ITEMS: SidebarItem[] = [
  {
    key: "profile",
    label: "Hồ sơ của tôi",
    icon: CircleUserRound,
    to: PATHS.profile,
  },
  { key: "browse", label: "Tìm đồ chơi", icon: Search, to: PATHS.toys },
  {
    key: "donations",
    label: "Quyên góp của tôi",
    icon: HandHeart,
    to: PATHS.donationHistory,
  },
  {
    key: "listings",
    label: "Tin đăng của tôi",
    icon: Package,
    to: PATHS.newListing,
  },
  { key: "rentals", label: "Đơn đặt thuê", icon: ReceiptText },
  { key: "wallet", label: "Ví ToyFlow", icon: Wallet },
  { key: "favorites", label: "Danh sách yêu thích", icon: Heart },
  { key: "reviews", label: "Đánh giá nhận được", icon: Star },
  { key: "password", label: "Đổi mật khẩu", icon: KeyRound },
];

export function SidebarBrand() {
  return (
    <Link to={PATHS.home} className="app-sidebar-brand" aria-label="ToyFlow - Trang chủ">
      <img src={brandMark} alt="" className="app-sidebar-brand__mark" width={226} height={160} />
      <span className="app-sidebar-brand__text">
        <img src={brandWordmark} alt="" className="app-sidebar-brand__wordmark" width={366} height={96} />
        <span className="app-sidebar-brand__tagline">Cổng phụ huynh</span>
      </span>
    </Link>
  );
}

/** Xoá token và quay về trang đăng nhập */
export function LogoutButton() {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      className="app-sidebar__item app-sidebar__item--logout"
      onClick={() => {
        clearAuthTokens();
        navigate(PATHS.login, { replace: true });
      }}
    >
      <LogOut aria-hidden />
      <span>Đăng xuất</span>
    </button>
  );
}

/** Trang công khai (vd. Tìm đồ chơi) cũng dùng khung này: khách chưa đăng nhập thấy nút Đăng nhập */
export function SessionButton() {
  if (getAccessToken()) return <LogoutButton />;

  return (
    <Link
      to={PATHS.login}
      className="app-sidebar__item app-sidebar__item--login"
    >
      <LogIn aria-hidden />
      <span>Đăng nhập</span>
    </Link>
  );
}

interface AppSidebarProps {
  activeKey: SidebarItemKey;
}

/** Sidebar tài khoản cố định bên trái, chỉ hiện từ màn hình lg trở lên */
export function AppSidebar({ activeKey }: AppSidebarProps) {
  return (
    <aside className="app-sidebar">
      <div className="app-sidebar__top">
        <SidebarBrand />
        <nav className="app-sidebar__nav" aria-label="Tài khoản">
          {SIDEBAR_ITEMS.map(({ key, label, icon: Icon, to }) => {
            const isActive = key === activeKey;
            const className = `app-sidebar__item ${isActive ? "is-active" : ""}`;

            return to ? (
              <Link
                key={key}
                to={to}
                className={className}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon aria-hidden />
                <span>{label}</span>
              </Link>
            ) : (
              <span
                key={key}
                className={`${className} is-unavailable`}
                aria-disabled="true"
                title="Sắp ra mắt"
              >
                <Icon aria-hidden />
                <span>{label}</span>
              </span>
            );
          })}
        </nav>
      </div>
      <SessionButton />
    </aside>
  );
}
