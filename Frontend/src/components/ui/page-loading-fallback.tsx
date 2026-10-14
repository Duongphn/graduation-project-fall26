import { Spin } from 'antd'

/** Hiển thị trong lúc loader của route đang gọi API ở lần tải trang đầu tiên */
export function PageLoadingFallback() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <Spin size="large" />
    </div>
  )
}
