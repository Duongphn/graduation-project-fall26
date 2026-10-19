import { ImageOff, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'

import { ageGroupLabels, toyConditionLabels } from '../../../constants/labels'
import { toyDetailPath } from '../../../routes/paths'
import type { DonationToy } from '../types'

/** Đồ chơi được quyên góp: ảnh, tình trạng, độ tuổi (dữ liệu tóm tắt của phiếu) */
export function DonationToyCard({ toy }: { toy: DonationToy | null }) {
  return (
    <section aria-labelledby="toy-title" className="rounded-xl border border-tf-surface bg-white p-5 sm:p-6">
      <h2 id="toy-title" className="flex items-center gap-2 text-base font-bold text-tf-ink">
        <ShieldCheck className="size-5 text-tf-secondary" aria-hidden /> Thông tin đồ chơi
      </h2>
      {toy ? (
        <div className="mt-4 flex flex-col gap-4 sm:flex-row">
          {toy.imageUrl ? (
            <img
              src={toy.imageUrl}
              alt={toy.title}
              loading="lazy"
              className="aspect-[4/3] w-full rounded-lg border border-tf-surface object-cover sm:w-44"
            />
          ) : (
            <span className="grid aspect-[4/3] w-full place-items-center rounded-lg bg-tf-page text-tf-ink-muted sm:w-44">
              <ImageOff className="size-6" aria-hidden />
            </span>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <Link to={toyDetailPath(toy.id)} className="text-base leading-6 font-semibold text-tf-ink hover:text-tf-primary">
              {toy.title}
            </Link>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-tf-page px-3 py-2">
                <dt className="text-xs text-tf-ink-muted">Tình trạng</dt>
                <dd className="font-semibold text-tf-ink">{toyConditionLabels[toy.condition]}</dd>
              </div>
              <div className="rounded-lg bg-tf-page px-3 py-2">
                <dt className="text-xs text-tf-ink-muted">Độ tuổi</dt>
                <dd className="font-semibold text-tf-ink">{ageGroupLabels[toy.ageGroup]}</dd>
              </div>
            </dl>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-tf-ink-muted">Đồ chơi không còn tồn tại.</p>
      )}
    </section>
  )
}
