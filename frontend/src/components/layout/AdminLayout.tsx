import { ConfigProvider, Layout, Menu, Progress, Typography } from 'antd'
import { useState } from 'react'
import { Link, Outlet, useLocation, useNavigation } from 'react-router-dom'

import { adminMenuItems } from '../../routes/admin-menu'
import { antdTheme } from '../../styles/theme'

// Admin area shell: dark sidebar menu + content. Desktop-first (R01 LI-01).
export function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const navigation = useNavigation()
  const location = useLocation()

  // The longest menu path that prefixes the current URL is the selected entry.
  const selected =
    [...adminMenuItems]
      .sort((a, b) => b.path.length - a.path.length)
      .find((item) => location.pathname.startsWith(item.path))?.key ?? 'dashboard'

  return (
    // The admin area keeps its own antd theme (palette.ts) inside the app-wide ThemeProvider.
    <ConfigProvider theme={antdTheme}>
    <Layout className="min-h-screen">
      <Layout.Sider collapsible collapsed={collapsed} onCollapse={setCollapsed} width={240}>
        <div className="flex h-16 items-center justify-center">
          <Typography.Text strong className="!text-lg !text-white">
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
      <Layout>
        {/* Thin bar while a lazy page is loading. */}
        {navigation.state === 'loading' && (
          <Progress percent={100} status="active" showInfo={false} size="small" className="!m-0 !leading-none" />
        )}
        <Layout.Content className="p-6">
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
    </ConfigProvider>
  )
}
