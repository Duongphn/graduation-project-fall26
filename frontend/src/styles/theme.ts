import type { ThemeConfig } from 'antd'

import { palette } from './palette'

// Ant Design theme built from the shared palette.
export const antdTheme: ThemeConfig = {
  token: {
    colorPrimary: palette.primary,
    colorSuccess: palette.success,
    colorWarning: palette.warning,
    colorError: palette.danger,
    colorInfo: palette.info,
    colorText: palette.text,
    colorTextSecondary: palette.textMuted,
    colorBorder: palette.border,
    colorBgLayout: palette.background,
    colorBgContainer: palette.surface,
    borderRadius: 8,
    fontFamily: "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  },
  components: {
    Layout: {
      siderBg: palette.sidebar,
      headerBg: palette.surface,
      bodyBg: palette.background,
    },
    Menu: {
      darkItemBg: palette.sidebar,
      darkSubMenuItemBg: palette.sidebar,
      darkItemColor: palette.sidebarText,
      darkItemSelectedBg: palette.primary,
    },
  },
}

// Writes the palette as CSS variables (--tf-primary, --tf-text-muted, ...) on <html>, so the
// Tailwind colours declared in src/index.css always match the antd theme.
export const applyCssVariables = (root: HTMLElement = document.documentElement): void => {
  for (const [name, value] of Object.entries(palette)) {
    const cssName = name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
    root.style.setProperty(`--tf-${cssName}`, value)
  }
}
