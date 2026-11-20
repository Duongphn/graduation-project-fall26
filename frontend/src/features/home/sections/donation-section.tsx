import { HeartHandshake, Plus, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PATHS } from '../../../routes/paths'
import { DONATION_CONTENT } from '../home-content'
import { homeButton } from '../home-styles'

const STAR = 'absolute text-tf-tertiary-fixed'

/**
 * Banner "Góc yêu thương": chữ bên trái, thùng quà 3D bên phải, đường lượn trang trí ở nền.
 * Danh sách "Tổ chức đang cần đồ chơi" sẽ thêm khi backend có API tổ chức từ thiện.
 */
export function DonationSection() {
  return (
    <section className="home-container mt-6 sm:mt-8" aria-labelledby="home-donation-title">
      <div className="relative isolate grid items-center gap-6 overflow-hidden rounded-3xl bg-site-donate p-6 text-white shadow-[0_24px_48px_-28px_rgb(44_106_82/0.9)] sm:p-10 md:grid-cols-[1.3fr_1fr]">
        <DonationWaves />

        <div className="flex flex-col items-start gap-4">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-tf-tertiary-fixed px-3.5 py-1.5 text-xs font-semibold text-tf-secondary">
            <Sparkles className="size-3.5 text-tf-secondary" aria-hidden /> {DONATION_CONTENT.badge}
          </p>
          <h2
            id="home-donation-title"
            className="flex items-center gap-3 text-3xl leading-tight font-bold tracking-[-0.02em] sm:text-4xl"
          >
            {DONATION_CONTENT.title} <HeartHandshake className="size-8 shrink-0 text-tf-error-container sm:size-9" aria-hidden />
          </h2>
          <p className="max-w-xl text-[15px] leading-7 text-white/85">{DONATION_CONTENT.description}</p>

          <ul className="flex flex-col items-start gap-2">
            {DONATION_CONTENT.highlights.map(({ icon: Icon, text }) => (
              <li
                key={text}
                className="inline-flex items-center gap-2 rounded-lg bg-white/12 px-3 py-1.5 text-[13px] font-medium text-white/90 ring-1 ring-white/10"
              >
                <Icon className="size-4 text-tf-tertiary-fixed" aria-hidden /> {text}
              </li>
            ))}
          </ul>

          <div className="mt-1 flex flex-wrap gap-3">
            <Link to={PATHS.newListing} className={homeButton('light')}>
              <Plus aria-hidden /> {DONATION_CONTENT.primaryLabel}
            </Link>
            <Link to={PATHS.donations} className={homeButton('ghostLight')}>
              {DONATION_CONTENT.secondaryLabel}
            </Link>
          </div>
        </div>

        {/* Thùng quà: vòng sáng phía sau + lơ lửng nhẹ (tắt khi bật "giảm chuyển động") */}
        <div className="relative mx-auto grid w-full max-w-56 place-items-center sm:max-w-64 md:max-w-80">
          <span className="absolute inset-8 -z-10 rounded-full bg-tf-tertiary-fixed/30 blur-3xl" aria-hidden />
          <img
            src={DONATION_CONTENT.image}
            alt={DONATION_CONTENT.imageAlt}
            className="w-full animate-donation-float drop-shadow-[0_24px_30px_rgb(18_23_31/0.35)]"
            loading="lazy"
            decoding="async"
          />
          <span className={`${STAR} top-2 left-2 animate-[ai-sparkle_2.6s_ease-in-out_infinite] text-xl`} aria-hidden>
            ★
          </span>
          <span className={`${STAR} top-10 right-0 animate-[ai-sparkle_2.6s_ease-in-out_1.3s_infinite] text-base`} aria-hidden>
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
    <svg className="pointer-events-none absolute inset-0 -z-10 size-full" viewBox="0 0 1200 400" preserveAspectRatio="none" aria-hidden focusable="false">
      <path d="M-20 70 C 160 -10, 300 150, 470 60 S 760 -20, 900 40" className="fill-none [stroke-width:26] [stroke-linecap:round] [stroke:rgb(220_235_227/0.28)]" />
      <path d="M680 420 C 820 300, 920 380, 1040 300 S 1180 220, 1240 260" className="fill-none [stroke-width:26] [stroke-linecap:round] [stroke:rgb(242_233_216/0.32)]" />
      <path d="M760 -20 C 860 60, 1000 10, 1220 70" className="fill-none [stroke-width:26] [stroke-linecap:round] [stroke:rgb(242_233_216/0.32)]" />
    </svg>
  )
}
