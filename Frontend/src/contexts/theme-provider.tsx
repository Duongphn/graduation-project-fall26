import { StyleProvider } from '@ant-design/cssinjs'
import { ConfigProvider, theme, type ThemeConfig } from 'antd'
import viVN from 'antd/locale/vi_VN'
import { useMemo, useState, type ReactNode } from 'react'
import { ThemeContext } from './theme-context'

const THEME_KEY = 'toyflow-theme'

const baseToken: ThemeConfig['token'] = {
  fontFamily: "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif",
  borderRadius: 12,
  controlHeightLG: 48,
  fontSizeLG: 15,
}

const formComponentToken = { verticalLabelPadding: '0 0 6px', itemMarginBottom: 20 }

const lightTheme: ThemeConfig = {
  algorithm: theme.defaultAlgorithm,
  token: {
    ...baseToken,
    colorPrimary: '#24338a',
    colorLink: '#24338a',
    colorBorder: '#e2e8f0',
  },
  components: {
    Form: formComponentToken,
    Button: { fontWeight: 700, primaryShadow: '0 4px 12px rgb(36 51 138 / 0.2)' },
  },
}

const darkTheme: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    ...baseToken,
    colorPrimary: '#a5b4fc',
    colorLink: '#a5b4fc',
    colorTextLightSolid: '#15161e', // chữ trên nút primary màu sáng phải tối để đủ tương phản
    colorBgContainer: '#1c1d27',
    colorBgElevated: '#262733',
    colorBorder: '#3a3b47',
  },
  components: {
    Form: formComponentToken,
    Button: { fontWeight: 700, primaryShadow: 'none' },
  },
}

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
          {children}
        </ConfigProvider>
      </StyleProvider>
    </ThemeContext.Provider>
  )
}
