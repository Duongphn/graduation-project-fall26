import { HeartHandshake, Plus, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PATHS } from '../../../routes/paths'
import { DONATION_CONTENT } from '../home-content'

/**
 * Banner "Góc yêu thương": chữ bên trái, thùng quà 3D bên phải, đường lượn trang trí ở nền.
 * Danh sách "Tổ chức đang cần đồ chơi" sẽ thêm khi backend có API tổ chức từ thiện.
 */
export function DonationSection() {
  return (
    <section className="home-container home-section" aria-labelledby="home-donation-title">
      <div className="donation-hero">
        <DonationWaves />

        <div className="donation-hero__content">
          <p className="donation-hero__badge">
            <Sparkles aria-hidden /> {DONATION_CONTENT.badge}
          </p>
          <h2 id="home-donation-title" className="donation-hero__title">
            {DONATION_CONTENT.title} <HeartHandshake className="donation-hero__title-icon" aria-hidden />
          </h2>
          <p className="donation-hero__text">{DONATION_CONTENT.description}</p>

          <ul className="donation-hero__highlights">
            {DONATION_CONTENT.highlights.map(({ icon: Icon, text }) => (
              <li key={text}>
                <Icon aria-hidden /> {text}
              </li>
            ))}
          </ul>

          <div className="donation-hero__actions">
            <Link to={PATHS.newListing} className="home-button home-button--light">
              <Plus aria-hidden /> {DONATION_CONTENT.primaryLabel}
            </Link>
            <Link to={PATHS.donations} className="home-button home-button--ghost-light">
              {DONATION_CONTENT.secondaryLabel}
            </Link>
          </div>
        </div>

        <div className="donation-hero__art">
          <span className="donation-hero__glow" aria-hidden />
          <img
            src={DONATION_CONTENT.image}
            alt={DONATION_CONTENT.imageAlt}
            className="donation-hero__image"
            loading="lazy"
            decoding="async"
          />
          <span className="donation-hero__star donation-hero__star--1" aria-hidden>
            ★
          </span>
          <span className="donation-hero__star donation-hero__star--2" aria-hidden>
            ★
          </span>
        </div>
      </div>
    </section>
  )
}

/** Hai dải lượn sóng mờ ở nền banner (chỉ trang trí) */
function DonationWaves() {
  return (
    <svg className="donation-hero__waves" viewBox="0 0 1200 400" preserveAspectRatio="none" aria-hidden focusable="false">
      <path d="M-20 70 C 160 -10, 300 150, 470 60 S 760 -20, 900 40" className="donation-hero__wave donation-hero__wave--mint" />
      <path d="M680 420 C 820 300, 920 380, 1040 300 S 1180 220, 1240 260" className="donation-hero__wave donation-hero__wave--cream" />
      <path d="M760 -20 C 860 60, 1000 10, 1220 70" className="donation-hero__wave donation-hero__wave--cream" />
    </svg>
  )
}
