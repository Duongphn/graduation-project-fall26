import type { LucideIcon } from 'lucide-react'
import type { Tone } from '../home-content'
import { TONE_CLASSES } from '../home-styles'

interface IconBadgeProps {
  icon: LucideIcon
  tone: Tone
  size?: 'md' | 'lg'
}

const SIZE_CLASSES = {
  md: 'size-11 [&_svg]:size-5',
  lg: 'size-14 [&_svg]:size-6',
}

/** Ô vuông bo góc chứa icon, nền nhạt theo tone */
export function IconBadge({ icon: Icon, tone, size = 'md' }: IconBadgeProps) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-xl ${SIZE_CLASSES[size]} ${TONE_CLASSES[tone]}`}
      aria-hidden
    >
      <Icon />
    </span>
  )
}
