import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { browseToysPath } from '../../../routes/paths'
import { AiAdvisorCard } from '../components/ai-advisor-card'
import { IconBadge } from '../components/icon-badge'
import { SectionHeader } from '../components/section-header'
import { AGE_GROUPS } from '../home-content'
import { TONE_CLASSES } from '../home-styles'

export function AgeGroupsSection() {
  return (
    <section
      className="home-container mt-6 grid gap-6 sm:mt-8 lg:grid-cols-[1.8fr_1fr] lg:items-stretch"
      aria-labelledby="home-ages-title"
    >
      <div>
        <SectionHeader id="home-ages-title" title="Chọn theo độ tuổi" subtitle="Đồ chơi phù hợp với từng giai đoạn của bé" />
        <ul className="grid gap-3 sm:grid-cols-2">
          {AGE_GROUPS.map((group) => (
            // Số nhóm tuổi lẻ: ô cuối trải hết hàng để lưới không bị hụt một góc
            <li key={group.title} className="sm:last:odd:col-span-2">
              <Link to={browseToysPath({ minAge: group.minAge, maxAge: group.maxAge })} className="group relative flex h-full min-h-32 flex-row items-center gap-3 overflow-hidden rounded-2xl border border-transparent bg-white py-4 pr-4 pl-5 shadow-[0_1px_2px_rgb(18_23_31/0.05),0_1px_12px_-4px_rgb(18_23_31/0.06)] transition-[border-color,box-shadow,transform] duration-300 ease-out-quint hover:-translate-y-0.5 hover:border-site-primary/30 hover:shadow-[0_14px_30px_-22px_rgb(20_40_75/0.6)] focus-ring dark:border-night-700 dark:bg-night-900 dark:shadow-none dark:hover:border-site-primary/30 dark:hover:shadow-[0_14px_30px_-22px_rgb(20_40_75/0.6)]">
                <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
                  {!group.image && <IconBadge icon={group.icon} tone={group.tone} />}
                  <span className="text-base leading-6 font-bold text-site-ink dark:text-white">{group.title}</span>
                  <span className="text-xs leading-5 text-site-muted dark:text-slate-400">{group.hint}</span>
                  {group.tag && <span className={`mt-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold ${TONE_CLASSES[group.tone]}`}>{group.tag}</span>}
                </span>
                {group.image && <img src={group.image} alt="" className="h-20 w-28 shrink-0 object-contain drop-shadow-[0_8px_10px_rgb(18_23_31/0.14)] transition-transform duration-300 ease-out-quint group-hover:-translate-y-1 group-hover:-rotate-3 group-hover:scale-105 sm:h-24 sm:w-32" loading="lazy" decoding="async" />}
                <ArrowRight
                  className="absolute right-3 bottom-3 size-4 text-tf-ink-muted transition-transform duration-300 ease-out-quint group-hover:translate-x-0.5 group-hover:text-site-primary"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <AiAdvisorCard />
    </section>
  )
}
