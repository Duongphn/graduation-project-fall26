export const env = {
  // Mặc định đi qua proxy của Vite khi dev (xem vite.config.ts)
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '/api/v1',
} as const
