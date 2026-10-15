import { theme, type ThemeConfig } from 'antd'

import { palettes, type Palette } from './palette'

// Ant Design themes built from the shared palette. ThemeProvider (contexts/theme-provider.tsx)
// is the only ConfigProvider and picks light or dark.
const baseToken: ThemeConfig['token'] = {
  fontFamily: "'Be Vietnam Pro', ui-sans-serif, system-ui, sans-serif",
  borderRadius: 12,
  controlHeightLG: 48,
  fontSizeLG: 15,
}

const formComponentToken = { verticalLabelPadding: '0 0 6px', itemMarginBottom: 20 }

const buildTheme = (colors: Palette, isDark: boolean): ThemeConfig => ({
  algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
  token: {
    ...baseToken,
    colorPrimary: colors.primary,
    colorLink: colors.primary,
    colorSuccess: colors.success,
    colorWarning: colors.warning,
    colorError: colors.danger,
    colorInfo: colors.info,
    colorBorder: colors.border,
    ...(isDark
      ? {
          colorTextLightSolid: colors.textOnPrimary,
          colorBgContainer: colors.surface,
          colorBgElevated: colors.elevated,
        }
      : {}),
  },
  components: {
    Form: formComponentToken,
    Button: {
      fontWeight: 700,
      primaryShadow: isDark ? 'none' : '0 4px 12px rgb(36 51 138 / 0.2)',
    },
  },
})

export const lightTheme = buildTheme(palettes.light, false)
export const darkTheme = buildTheme(palettes.dark, true)

// Extra component tokens of the admin area (sidebar + menu), merged on top of the app theme in
// AdminLayout. Only Layout/Menu tokens: everything else comes from the app theme.
export const adminComponentTokens = (isDark: boolean): ThemeConfig['components'] => {
  const colors = isDark ? palettes.dark : palettes.light
  return {
    Layout: {
      siderBg: colors.sidebar,
      triggerBg: colors.sidebar,
      headerBg: colors.surface,
      bodyBg: colors.background,
    },
    Menu: {
      darkItemBg: colors.sidebar,
      darkSubMenuItemBg: colors.sidebar,
      darkItemColor: colors.sidebarText,
      darkItemSelectedBg: isDark ? colors.elevated : palettes.light.primary,
      darkItemSelectedColor: isDark ? colors.primary : palettes.light.textOnPrimary,
    },
  }
}
