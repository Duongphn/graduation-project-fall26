// ToyFlow colour palette: the ONE set of colours, light and dark (navy brand, Be Vietnam Pro).
// - Ant Design reads it through src/styles/theme.ts (ThemeProvider, the only ConfigProvider).
// - Tailwind reads the same values through the --tf-* variables declared in src/index.css
//   (:root = light, .dark = dark) and mapped by @theme inline (bg-primary, text-muted...).
//   When a value changes here, change the matching --tf-* line in index.css too.
// - The brand/night Tailwind tokens in index.css (@theme) use the same hex values
//   (brand-button = light.primary, night-950/900/800/700 = dark background/surface/elevated/border).
// Never hard-code hex in components.
const light = {
  primary: '#24338a',
  primaryHover: '#1c2870',
  primarySoft: '#e4e8f0',
  textOnPrimary: '#ffffff',
  secondary: '#2c6a52',
  secondarySoft: '#dcebe3',
  // Status colours = Ant Design's default seeds, so antd and Tailwind show the same colours.
  success: '#52c41a',
  warning: '#faad14',
  danger: '#ff4d4f',
  info: '#1677ff',
  text: '#0f172a',
  textMuted: '#565c68',
  border: '#e2e8f0',
  surface: '#ffffff',
  elevated: '#ffffff',
  background: '#faf8f3',
  sidebar: '#152152',
  sidebarText: '#e4e8f0',
}

export type Palette = typeof light

const dark: Palette = {
  primary: '#a5b4fc',
  primaryHover: '#c7d2fe',
  primarySoft: '#262733',
  // Text on a light primary button must be dark for contrast.
  textOnPrimary: '#15161e',
  secondary: '#86c5a9',
  secondarySoft: '#1f3329',
  success: '#52c41a',
  warning: '#faad14',
  danger: '#ff4d4f',
  info: '#1677ff',
  text: '#f1f5f9',
  textMuted: '#a1a6b3',
  border: '#3a3b47',
  surface: '#1c1d27',
  elevated: '#262733',
  background: '#15161e',
  sidebar: '#1c1d27',
  sidebarText: '#c7cbe0',
}

export const palettes = { light, dark } as const

export type PaletteColor = keyof Palette
