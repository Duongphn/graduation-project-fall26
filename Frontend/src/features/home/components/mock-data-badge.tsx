import { isMockingHomeToys } from '../home-api'

/** Nhãn cảnh báo khi section đang hiển thị dữ liệu mẫu — chỉ có ở môi trường dev */
export function MockDataBadge() {
  if (!import.meta.env.DEV || !isMockingHomeToys()) return null

  return (
    <p className="home-mock-badge" role="note">
      Dữ liệu mẫu để xem trước giao diện — không phải tin đăng thật
    </p>
  )
}
