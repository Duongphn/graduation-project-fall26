import { useEffect } from 'react'
import { useScrollToHash } from '../hooks/use-scroll-to-hash'
import { HERO_SEARCH_ANCHOR_ID } from '../features/home/home-content'
import { AgeGroupsSection } from '../features/home/sections/age-groups-section'
import { CategoriesSection } from '../features/home/sections/categories-section'
import { DonateToysSection } from '../features/home/sections/donate-toys-section'
import { DonationSection } from '../features/home/sections/donation-section'
import { FeaturedRentalsSection } from '../features/home/sections/featured-rentals-section'
import { HeroSection } from '../features/home/sections/hero-section'
import { HowItWorksSection } from '../features/home/sections/how-it-works-section'
import { ResaleSection } from '../features/home/sections/resale-section'
import { SiteLayout } from '../layouts/site/site-layout'

/**
 * Thứ tự theo hành trình người dùng: tìm đồ → xem đồ thuê → hiểu cách thuê → đồ bán lại
 * → chọn theo tuổi / hỏi AI → quyên góp → mời đăng đồ.
 */
export function HomePage() {
  useEffect(() => {
    document.title = 'ToyFlow - Thuê, mua lại và quyên góp đồ chơi'
  }, [])

  // Mục "Trợ lý AI" trên header trỏ tới "/#tro-ly-ai"
  useScrollToHash()

  return (
    <SiteLayout revealHeaderSearchAfterId={HERO_SEARCH_ANCHOR_ID}>
      <HeroSection />
      <CategoriesSection />
      <FeaturedRentalsSection />
      <HowItWorksSection />
      <ResaleSection />
      <AgeGroupsSection />
      <DonateToysSection />
      <DonationSection />
    </SiteLayout>
  )
}
