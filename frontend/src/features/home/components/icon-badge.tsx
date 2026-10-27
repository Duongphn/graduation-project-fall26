import type { LucideIcon } from 'lucide-react'
import type { Tone } from '../home-content'

interface IconBadgeProps {
  icon: LucideIcon
  tone: Tone
  size?: 'md' | 'lg'
}

/** Ô vuông bo góc chứa icon, nền nhạt theo tone */
export function IconBadge({ icon: Icon, tone, size = 'md' }: IconBadgeProps) {
  return (
    <span className={`icon-badge icon-badge--${size} tone--${tone}`} aria-hidden>
      <Icon />
    </span>
  )
}
