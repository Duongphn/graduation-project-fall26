import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { browseToysPath } from '../../../routes/paths'
import { AiAdvisorCard } from '../components/ai-advisor-card'
import { IconBadge } from '../components/icon-badge'
import { SectionHeader } from '../components/section-header'
import { AGE_GROUPS } from '../home-content'

export function AgeGroupsSection() {
  return (
    <section className="home-container home-section home-ages" aria-labelledby="home-ages-title">
      <div className="home-ages__main">
        <SectionHeader id="home-ages-title" title="Chọn theo độ tuổi" subtitle="Đồ chơi phù hợp với từng giai đoạn của bé" />
        <ul className="home-ages__grid">
          {AGE_GROUPS.map((group) => (
            <li key={group.title}>
              <Link to={browseToysPath({ minAge: group.minAge, maxAge: group.maxAge })} className="home-card age-tile">
                <span className="age-tile__text">
                  {!group.image && <IconBadge icon={group.icon} tone={group.tone} />}
                  <span className="age-tile__label">{group.title}</span>
                  <span className="age-tile__hint">{group.hint}</span>
                  {group.tag && <span className={`age-tile__tag tone--${group.tone}`}>{group.tag}</span>}
                </span>
                {group.image && <img src={group.image} alt="" className="age-tile__image" loading="lazy" decoding="async" />}
                <ArrowRight className="age-tile__arrow" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <AiAdvisorCard />
    </section>
  )
}
