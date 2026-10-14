/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  /** 'true' = dùng dữ liệu mẫu cho "Đồ cho thuê nổi bật" và "Đồ cũ bán lại" (chỉ có tác dụng khi chạy dev) */
  readonly VITE_MOCK_HOME_TOYS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
