import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Chuyển tiếp /api sang backend khi dev để tránh lỗi CORS
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
