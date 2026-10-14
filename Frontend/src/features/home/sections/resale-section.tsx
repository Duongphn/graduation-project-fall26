import { Tag } from 'lucide-react'
import { browseToysPath, PATHS } from '../../../routes/paths'
import { MockDataBadge } from '../components/mock-data-badge'
import { SectionHeader } from '../components/section-header'
import { ToyGrid } from '../components/toy-grid'
import { resaleToysQuery } from '../home-queries'

export function ResaleSection() {
  return (
    <section className="home-container home-section" aria-labelledby="home-resale-title">
      <SectionHeader
        id="home-resale-title"
        title="Đồ cũ bán lại"
        highlight="giá tốt"
        subtitle="Tiền được giữ trung gian, chỉ chuyển cho người bán khi bạn xác nhận đã nhận đồ"
        action={{ label: 'Xem tất cả', to: browseToysPath({ type: 'sell' }) }}
      />
      <MockDataBadge />
      <ToyGrid
        query={resaleToysQuery}
        listingType="sell"
        empty={{
          icon: Tag,
          title: 'Chưa có đồ chơi bán lại',
          description: 'Đồ chơi còn tốt nhưng bé không chơi nữa? Đăng bán để đồ đến tay gia đình khác.',
          ctaLabel: 'Đăng bán đồ chơi',
          to: PATHS.newListing,
        }}
      />
    </section>
  )
}
