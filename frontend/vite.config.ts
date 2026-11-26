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
      // Socket.IO (thông báo realtime): cùng backend, cần chuyển tiếp cả WebSocket
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
})
