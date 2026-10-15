import { StyleProvider } from '@ant-design/cssinjs'
import { App as AntdApp, ConfigProvider } from 'antd'
import viVN from 'antd/locale/vi_VN'
import { useMemo, useState, type ReactNode } from 'react'
import { darkTheme, lightTheme } from '../styles/theme'
import { ThemeContext } from './theme-context'

const THEME_KEY = 'toyflow-theme'

/** Màu light/dark lấy từ src/styles/palette.ts (qua styles/theme.ts). AntdApp cho App.useApp() (message, modal) */
/** StyleProvider `layer` đưa style antd vào `@layer antd` (index.css) để class Tailwind ghi đè được */
export function ThemeProvider({ children }: { children: ReactNode }) {
  // Class `.dark` đã được gắn sẵn bởi script trong index.html (tránh nháy màu khi tải trang)
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'))

  const value = useMemo(
    () => ({
      isDark,
      toggleTheme: () => {
        const next = !isDark
        document.documentElement.classList.toggle('dark', next)
        try {
          localStorage.setItem(THEME_KEY, next ? 'dark' : 'light')
        } catch {
          // Trình duyệt chặn storage: theme vẫn đổi trong phiên hiện tại
        }
        setIsDark(next)
      },
    }),
    [isDark],
  )

  return (
    <ThemeContext.Provider value={value}>
      <StyleProvider layer>
        <ConfigProvider locale={viVN} theme={isDark ? darkTheme : lightTheme}>
          <AntdApp>{children}</AntdApp>
        </ConfigProvider>
      </StyleProvider>
    </ThemeContext.Provider>
  )
}
