import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './contexts/theme-provider'
import { wakeServer } from './services/http-client'
import { queryClient } from './services/query-client'
import { applyCssVariables } from './styles/theme'

// Biến màu --tf-* cho khu quản trị và trang quyên góp (src/styles/palette.ts).
applyCssVariables()
// Đánh thức API (Render free ngủ sau 15 phút) ngay khi mở web, trước khi người dùng bấm Đăng nhập.
wakeServer()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)
