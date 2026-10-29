import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

const subscribe = (onChange: () => void) => {
  const media = window.matchMedia(QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

const getSnapshot = () => window.matchMedia(QUERY).matches

/** true khi người dùng bật "giảm chuyển động" trong hệ điều hành — dùng để tắt tự chạy slide, hiệu ứng */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot)
}
