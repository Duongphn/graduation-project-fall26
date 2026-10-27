// ToyFlow colour palette — the ONLY place colours are defined.
// Ant Design reads it through src/styles/theme.ts; Tailwind reads the same values through the
// CSS variables written by applyCssVariables() and mapped in src/index.css (@theme inline).
// Use Tailwind classes such as `bg-primary`, `text-muted` or antd tokens; never hard-code hex.
export const palette = {
  primary: '#2f7d6d',
  primaryHover: '#256558',
  primarySoft: '#e3f2ee',
  secondary: '#f2a541',
  secondarySoft: '#fdf1df',
  success: '#2e9d5b',
  warning: '#e8a317',
  danger: '#d64545',
  info: '#2f6fd6',
  text: '#1f2933',
  textMuted: '#616e7c',
  border: '#d9e2ec',
  surface: '#ffffff',
  background: '#f5f7fa',
  sidebar: '#16302b',
  sidebarText: '#d7e8e3',
} as const

export type PaletteColor = keyof typeof palette
