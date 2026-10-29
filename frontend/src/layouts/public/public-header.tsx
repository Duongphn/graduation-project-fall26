import { Bell, MessageCircle, Plus, Search, type LucideIcon } from 'lucide-react'
import type { FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ThemeToggle } from '../../components/ui/theme-toggle'
import { formatVnd } from '../../features/toy-listings/format-vnd'
import { PATHS } from '../../routes/paths'
import { getAccessToken, getStoredUser } from '../../services/token-storage'

/**
 * Mục chưa có backend vẫn hiện (giống AppSidebar) nhưng không điều hướng, kèm tooltip "Sắp ra mắt".
 * Khi backend có API: điền `to` cho mục điều hướng; truyền `count` / `walletBalance` từ query tương ứng.
 */
const UPCOMING_TITLE = 'Sắp ra mắt'

interface NavItem {
  label: string
  /** Bỏ trống khi trang chưa tồn tại */
  to?: string
  active?: boolean
}

interface InboxItem {
  key: 'messages' | 'notifications'
  label: string
  icon: LucideIcon
  to?: string
  /** Số chưa đọc; undefined khi chưa có API (không hiện chấm đỏ giả) */
  count?: number
}

const INBOX_ITEMS: InboxItem[] = [
  // Chờ API hội thoại (server/src/features/conversations, messages)
  { key: 'messages', label: 'Tin nhắn', icon: MessageCircle },
  // Chờ API thông báo (server/src/features/notifications)
  { key: 'notifications', label: 'Thông báo', icon: Bell },
]

/** Ví chưa có API (server/src/features/wallets): undefined thì hiện "Ví sắp ra mắt" thay vì số dư */
const walletBalance: number | undefined = undefined

/** "Mẹ Bảo Anh" → "BA": chữ cái đầu của hai từ cuối, như cách gọi tên tiếng Việt */
function initialsOf(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean)
  return words
    .slice(-2)
    .map((word) => word.charAt(0))
    .join('')
    .toLocaleUpperCase('vi')
}

function NavLinkItem({ item }: { item: NavItem }) {
  if (!item.to) {
    return (
      <span className="pl-nav__link is-unavailable" aria-disabled="true" title={UPCOMING_TITLE}>
        {item.label}
      </span>
    )
  }
  return (
    <Link to={item.to} className="pl-nav__link" aria-current={item.active ? 'page' : undefined}>
      {item.label}
    </Link>
  )
}

function InboxButton({ item }: { item: InboxItem }) {
  const Icon = item.icon
  const badge = item.count ? <span className="pl-icon-btn__badge">{item.count > 99 ? '99+' : item.count}</span> : null
  const label = item.count ? `${item.label}, ${item.count} chưa đọc` : item.label

  if (!item.to) {
    return (
      <span className="pl-icon-btn is-unavailable" role="img" aria-label={`${item.label} (sắp ra mắt)`} title={`${item.label}: ${UPCOMING_TITLE.toLowerCase()}`}>
        <Icon aria-hidden="true" />
      </span>
    )
  }
  return (
    <Link to={item.to} className="pl-icon-btn" aria-label={label}>
      <Icon aria-hidden="true" />
      {badge}
    </Link>
  )
}

/** Ô tìm nhanh cho các trang không có ô tìm riêng (vd. trang chi tiết) */
function HeaderSearch() {
  const navigate = useNavigate()

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const keyword = String(new FormData(event.currentTarget).get('q') ?? '').trim()
    navigate(keyword ? `${PATHS.toys}?${new URLSearchParams({ q: keyword })}` : PATHS.toys)
  }

  return (
    <form role="search" className="pl-search" onSubmit={submit}>
      <label htmlFor="header-keyword" className="sr-only">
        Tìm đồ chơi
      </label>
      <input id="header-keyword" name="q" type="search" placeholder="Tìm đồ chơi…" autoComplete="off" enterKeyHint="search" />
      <button type="submit" className="pl-search__submit" aria-label="Tìm">
        <Search aria-hidden="true" />
      </button>
    </form>
  )
}

function AccountChip() {
  const user = getStoredUser()
  const name = user?.fullName ?? 'Tài khoản của tôi'

  return (
    <Link to={PATHS.myListings} className="pl-account" aria-label={`${name}, mở tin đăng của tôi`}>
      <span className="pl-account__text">
        <span className="pl-account__name">{name}</span>
        <span className="pl-account__wallet">
          {walletBalance === undefined ? 'Ví sắp ra mắt' : formatVnd(walletBalance)}
        </span>
      </span>
      <span className="pl-account__avatar" aria-hidden="true">
        {user ? initialsOf(user.fullName) : '?'}
      </span>
    </Link>
  )
}

export function PublicHeader() {
  const location = useLocation()
  const isSignedIn = Boolean(getAccessToken())
  const onCatalog = location.pathname === PATHS.toys
  const listingType = new URLSearchParams(location.search).get('type')

  const navItems: NavItem[] = [
    { label: 'Thuê đồ chơi', to: `${PATHS.toys}?type=rent`, active: onCatalog && listingType === 'rent' },
    { label: 'Mua lại', to: `${PATHS.toys}?type=sell`, active: onCatalog && listingType === 'sell' },
    // Chờ API quyên góp (server/src/features/donation_requests)
    { label: 'Quyên góp' },
    // Chờ API tư vấn AI (server/src/features/ai_requests)
    { label: 'AI tư vấn' },
  ]

  return (
    <header className="pl-header">
      <div className="pl-container pl-header__inner">
        <Link to={PATHS.toys} className="pl-brand" aria-label="ToyFlow, về trang tìm đồ chơi">
          <span className="pl-brand__mark" aria-hidden="true">
            T
          </span>
          <span className="pl-brand__name">ToyFlow</span>
        </Link>

        <nav className="pl-nav" aria-label="Điều hướng chính">
          {navItems.map((item) => (
            <NavLinkItem key={item.label} item={item} />
          ))}
        </nav>

        {!onCatalog && <HeaderSearch />}

        <div className="pl-header__actions">
          <ThemeToggle />
          {isSignedIn && INBOX_ITEMS.map((item) => <InboxButton key={item.key} item={item} />)}
          <Link to={PATHS.newListing} className="pl-btn pl-btn--primary pl-btn--sm pl-header__post">
            <Plus aria-hidden="true" />
            Đăng đồ
          </Link>
          {isSignedIn ? (
            <AccountChip />
          ) : (
            <Link to={PATHS.login} className="pl-btn pl-btn--ghost pl-btn--sm">
              Đăng nhập
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
