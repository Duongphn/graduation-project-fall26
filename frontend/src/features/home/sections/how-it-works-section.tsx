import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PATHS } from '../../../routes/paths'
import { RENTAL_GUARANTEE, RENTAL_STEPS } from '../home-content'

export function HowItWorksSection() {
  const { icon: GuaranteeIcon } = RENTAL_GUARANTEE

  return (
    <section className="home-band" aria-labelledby="home-steps-title">
      <div className="home-container">
        <header className="home-section-header">
          <div>
            <h2 id="home-steps-title" className="home-section-header__title">
              Thuê đồ chơi trên ToyFlow như thế nào?
            </h2>
            <p className="home-section-header__subtitle">
              {RENTAL_STEPS.length} bước, tiền cọc luôn được giữ an toàn đến khi trả đồ.
            </p>
          </div>
          <Link to={`${PATHS.help}#rental`} className="home-link">
            Quy định thuê và đặt cọc <ArrowRight aria-hidden />
          </Link>
        </header>

        <ol className="home-steps__list">
          {RENTAL_STEPS.map((step, index) => (
            <li key={step.title} className="home-card home-step">
              <div className="home-step__media">
                <img src={step.image} alt="" className="home-step__image" loading="lazy" decoding="async" />
                {/* <ol> đã cho trình đọc màn hình biết thứ tự → nhãn này chỉ để nhìn */}
                <span className="home-step__number" aria-hidden>
                  Bước {index + 1}
                </span>
              </div>
              <h3 className="home-step__title">{step.title}</h3>
              <p className="home-card__text">{step.description}</p>
            </li>
          ))}
        </ol>

        <p className="home-steps__guarantee">
          <GuaranteeIcon aria-hidden /> {RENTAL_GUARANTEE.text}
        </p>
      </div>
    </section>
  )
}
