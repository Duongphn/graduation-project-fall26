import { HomeOutlined, LogoutOutlined, MenuOutlined } from '@ant-design/icons'
import { Badge, Button, ConfigProvider, Layout, Menu, Progress, Typography } from 'antd'
import { useState } from 'react'
import { Link, Outlet, useLocation, useNavigate, useNavigation } from 'react-router-dom'

import { logout } from '../../features/auth/auth-api'
import { NotificationMenu } from '../../layouts/site/notification-menu'
import { adminMenuItems } from '../../routes/admin-menu'
import { adminPaths, PATHS } from '../../routes/paths'
import { antdTheme } from '../../styles/theme'
import { useAdminPendingCounts } from './useAdminPendingCounts'

// Admin area shell: dark sidebar menu + content. Desktop-first (R01 LI-01); below the md
// breakpoint (phones) the menu is hidden and opens over the content from a button in the top bar.
export function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const [narrow, setNarrow] = useState(false)
  const navigation = useNavigation()
  const location = useLocation()
  const navigate = useNavigate()
  const pendingCounts = useAdminPendingCounts()

  // The longest menu path that prefixes the current URL is the selected entry.
  const selected =
    [...adminMenuItems]
      .sort((a, b) => b.path.length - a.path.length)
      .find((item) => location.pathname.startsWith(item.path))?.key ?? 'dashboard'

  return (
    // The admin area keeps its own light antd theme (palette.ts) inside the app-wide
    // ThemeProvider. `inherit: false`: in the site's dark mode, antd would otherwise merge the
    // dark algorithm and dark tokens (modal and popup backgrounds, text on primary buttons) with
    // this palette's dark text. `text-text` does the same for plain text, which would inherit
    // the dark-mode body colour.
    <ConfigProvider theme={{ ...antdTheme, inherit: false }}>
    <Layout className="min-h-screen text-text">
      <Layout.Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        width={240}
        breakpoint="md"
        onBreakpoint={setNarrow}
        collapsedWidth={narrow ? 0 : 80}
        // Phones: no built-in trigger (the top bar has the menu button) and the menu overlays the page.
        trigger={narrow ? null : undefined}
        className={narrow ? '!fixed inset-y-0 left-0 z-50 overflow-y-auto' : undefined}
      >
        <div className="flex h-16 items-center justify-center">
          <Typography.Text strong className="!text-lg !text-white">
            {collapsed ? 'TF' : 'Quản trị ToyFlow'}
          </Typography.Text>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selected]}
          // On a phone the open menu covers the page: close it once an entry is picked.
          onClick={() => {
            if (narrow) setCollapsed(true)
          }}
          // Real links: open in a new tab works and screen readers announce links.
          items={adminMenuItems.map((item) => {
            const pending = item.pendingCounter ? (pendingCounts[item.pendingCounter] ?? 0) : 0
            return {
              key: item.key,
              icon: item.icon,
              // Pending counter (L7): the queue replaces any "new post" notification to Admins.
              label: pending ? (
                <span className="flex items-center justify-between gap-2">
                  <Link to={item.path}>{item.label}</Link>
                  <Badge count={pending} overflowCount={99} title={`${pending} đang chờ duyệt`} />
                </span>
              ) : (
                <Link to={item.path}>{item.label}</Link>
              ),
            }
          })}
        />
      </Layout.Sider>
      {narrow && !collapsed && (
        <div aria-hidden className="fixed inset-0 z-40 bg-black/40" onClick={() => setCollapsed(true)} />
      )}
      <Layout className="min-w-0">
        {/* Top bar: the notification bell (UC26, same as the user header), back to the site and
            log out (the admin area has no other way out). */}
        <Layout.Header className="flex items-center justify-end gap-2 !bg-white !px-3 !leading-none shadow-sm md:!px-6">
          {narrow && (
            <Button
              type="text"
              icon={<MenuOutlined />}
              aria-label="Mở menu quản trị"
              aria-expanded={!collapsed}
              className="mr-auto"
              onClick={() => setCollapsed(false)}
            />
          )}
          <NotificationMenu allPath={adminPaths.notifications} />
          <Link to={PATHS.home}>
            <Button type="text" icon={<HomeOutlined />} aria-label="Về trang chủ">
              {!narrow && 'Về trang chủ'}
            </Button>
          </Link>
          <Button
            icon={<LogoutOutlined />}
            onClick={() => void logout().then(() => navigate(PATHS.login, { replace: true }))}
          >
            Đăng xuất
          </Button>
        </Layout.Header>
        {/* Thin bar while a lazy page is loading. */}
        {navigation.state === 'loading' && (
          <Progress percent={100} status="active" showInfo={false} size="small" className="!m-0 !leading-none" />
        )}
        <Layout.Content className="p-3 md:p-6">
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
    </ConfigProvider>
  )
}
