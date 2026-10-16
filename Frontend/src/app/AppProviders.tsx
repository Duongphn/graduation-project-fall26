import { App as AntdApp } from 'antd'
import type { ReactNode } from 'react'

// React Query, the antd theme and the Vietnamese locale are provided in main.tsx
// (QueryClientProvider + ThemeProvider). This adds antd App, so message, modal and notification
// hooks work through App.useApp(). The admin area applies its own antd theme in AdminLayout.
export function AppProviders({ children }: { children: ReactNode }) {
  return <AntdApp>{children}</AntdApp>
}
