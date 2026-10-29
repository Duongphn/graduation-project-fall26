import { PackagePlus } from 'lucide-react'
import { browseToysPath, PATHS } from '../../../routes/paths'
import { SectionHeader } from '../components/section-header'
import { ToyGrid } from '../components/toy-grid'
import { featuredRentalsQuery } from '../home-queries'

export function FeaturedRentalsSection() {
  return (
    <section className="home-container home-section" aria-labelledby="home-rentals-title">
      <SectionHeader
        id="home-rentals-title"
        title="Đồ cho thuê"
        highlight="nổi bật"
        subtitle="Được thuê nhiều trong tuần, giá tính theo ngày"
        action={{ label: 'Xem tất cả', to: browseToysPath({ type: 'rent' }) }}
      />
      <ToyGrid
        query={featuredRentalsQuery}
        listingType="rent"
        empty={{
          icon: PackagePlus,
          title: 'Chưa có đồ chơi cho thuê',
          description: 'Món đồ bé đã chán có thể là niềm vui mới của bé khác. Hãy là người đầu tiên cho thuê!',
          ctaLabel: 'Đăng đồ cho thuê',
          to: PATHS.newListing,
        }}
      />
    </section>
  )
}
