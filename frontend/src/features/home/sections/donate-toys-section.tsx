import { Gift } from 'lucide-react'

import { DONATE_TOYS_ANCHOR, PATHS } from '../../../routes/paths'
import { SectionHeader } from '../components/section-header'
import { ToyGrid } from '../components/toy-grid'
import { donateToysQuery } from '../home-queries'

/** Đồ chơi quyên góp đang chờ người nhận (GET /toys?listingType=donate) — bấm thẻ để xin nhận */
export function DonateToysSection() {
  return (
    <section id={DONATE_TOYS_ANCHOR} className="home-container home-section" aria-labelledby="home-donate-title">
      <SectionHeader
        id="home-donate-title"
        title="Đồ chơi quyên góp"
        highlight="miễn phí"
        subtitle="Các gia đình tặng lại đồ chơi bé không chơi nữa — chọn món phù hợp và gửi yêu cầu nhận"
        action={{ label: 'Yêu cầu nhận đồ của tôi', to: PATHS.myDonationRequests }}
      />
      <ToyGrid
        query={donateToysQuery}
        listingType="donate"
        empty={{
          icon: Gift,
          title: 'Chưa có đồ chơi quyên góp',
          description: 'Đồ chơi còn tốt mà bé không dùng nữa? Tặng lại để mang niềm vui cho trẻ em khác.',
          ctaLabel: 'Tặng đồ chơi',
          to: PATHS.newDonation,
        }}
      />
    </section>
  )
}
