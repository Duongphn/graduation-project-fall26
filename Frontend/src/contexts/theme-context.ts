import { createContext, useContext } from 'react'

export interface ThemeContextValue {
  isDark: boolean
  toggleTheme: () => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme phải được dùng bên trong <ThemeProvider>')
  return value
}
