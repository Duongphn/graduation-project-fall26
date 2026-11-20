import { ImageOff } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toyDetailPath } from '../../../routes/paths'
import { advisorPriceLabel } from '../advisor-filters'
import type { AdvisorToy } from '../ai-chat-api'

/** Thẻ đồ chơi Robo gợi ý trong khung chat: ảnh, tên, giá, tình trạng, lý do và link tới tin đăng */
function AdvisorToyCard({ toy }: { toy: AdvisorToy }) {
  return (
    <Link
      to={toyDetailPath(toy.id)}
      className="flex gap-3 rounded-xl bg-white/10 p-2.5 text-white transition-colors hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
    >
      {toy.image ? (
        <img src={toy.image} alt="" loading="lazy" className="size-16 shrink-0 rounded-lg object-cover" />
      ) : (
        <span aria-hidden className="grid size-16 shrink-0 place-items-center rounded-lg bg-white/10 text-white/50">
          <ImageOff className="size-5" />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold">{toy.name}</span>
        <span className="text-xs text-white/70">
          <span className="font-semibold text-site-highlight-bright">{advisorPriceLabel(toy)}</span> · {toy.condition}
        </span>
        <span className="line-clamp-2 text-xs leading-5 text-white/80">{toy.reason}</span>
      </span>
    </Link>
  )
}

export function AdvisorToyList({ toys }: { toys: AdvisorToy[] }) {
  return (
    <ul aria-label="Đồ chơi Robo gợi ý" className="flex w-full flex-col gap-2">
      {toys.map((toy) => (
        <li key={toy.id}>
          <AdvisorToyCard toy={toy} />
        </li>
      ))}
    </ul>
  )
}
