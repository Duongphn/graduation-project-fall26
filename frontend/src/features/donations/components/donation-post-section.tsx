import type { ReactNode } from 'react'

interface DonationPostSectionProps {
  step: string
  title: string
  subtitle: string
  badge?: ReactNode
  children: ReactNode
}

/** Khung một bước của phiếu quyên góp: số thứ tự, tiêu đề, nhãn bên phải */
export function DonationPostSection({ step, title, subtitle, badge, children }: DonationPostSectionProps) {
  const headingId = `donation-step-${step}`
  return (
    <section aria-labelledby={headingId} className="rounded-xl border border-tf-surface bg-white p-5 sm:p-6">
      <header className="mb-5 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-tf-primary-fixed text-sm font-bold text-tf-primary">
            {step}
          </span>
          <div>
            <h2 id={headingId} className="text-lg leading-6 font-bold text-tf-ink">
              {title}
            </h2>
            <p className="text-sm text-tf-ink-muted">{subtitle}</p>
          </div>
        </div>
        {badge}
      </header>
      {children}
    </section>
  )
}
