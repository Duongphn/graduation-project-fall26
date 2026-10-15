import { ConfigProvider, Layout, Menu, Progress, Typography } from 'antd'
import { useState } from 'react'
import { Link, Outlet, useLocation, useNavigation } from 'react-router-dom'

import { useTheme } from '../../contexts/theme-context'
import { adminMenuItems } from '../../routes/admin-menu'
import { adminComponentTokens } from '../../styles/theme'
import { ThemeToggle } from '../ui/theme-toggle'

// Admin area shell: sidebar menu + header with the theme toggle + content. Desktop-first
// (R01 LI-01); below lg the sidebar hides (width 0) behind the trigger button, so a phone gets
// the content full width. Colours come from the app theme (ThemeProvider); this only adds the sidebar and
// menu tokens, so light and dark mode both work.
export function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const [narrow, setNarrow] = useState(false)
  const navigation = useNavigation()
  const location = useLocation()
  const { isDark } = useTheme()

  // The longest menu path that prefixes the current URL is the selected entry.
  const selected =
    [...adminMenuItems]
      .sort((a, b) => b.path.length - a.path.length)
      .find((item) => location.pathname.startsWith(item.path))?.key ?? 'dashboard'

  return (
    <ConfigProvider theme={{ components: adminComponentTokens(isDark) }}>
      <Layout className="min-h-screen">
        <Layout.Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          breakpoint="lg"
          onBreakpoint={(broken) => {
            setNarrow(broken)
            setCollapsed(broken)
          }}
          collapsedWidth={narrow ? 0 : 80}
          width={240}
          className={narrow && !collapsed ? '!fixed inset-y-0 left-0 z-20' : undefined}
        >
          <div className="flex h-16 items-center justify-center">
            <Typography.Text strong className="!text-lg !text-sidebar-text">
              {collapsed ? 'TF' : 'Quản trị ToyFlow'}
            </Typography.Text>
          </div>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={[selected]}
            // Real links: open in a new tab works and screen readers announce links.
            items={adminMenuItems.map((item) => ({
              key: item.key,
              icon: item.icon,
              label: <Link to={item.path}>{item.label}</Link>,
            }))}
          />
        </Layout.Sider>
        <Layout className="min-w-0">
          <Layout.Header className="flex items-center justify-end !px-4 lg:!px-6">
            <ThemeToggle />
          </Layout.Header>
          {/* Thin bar while a lazy page is loading. */}
          {navigation.state === 'loading' && (
            <Progress percent={100} status="active" showInfo={false} size="small" className="!m-0 !leading-none" />
          )}
          <Layout.Content className="min-w-0 p-4 lg:p-6">
            <Outlet />
          </Layout.Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  )
}
