import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { usePrefersReducedMotion } from './use-prefers-reduced-motion'

/**
 * Cuộn tới phần tử có id = #hash trên URL (vd. "/#tro-ly-ai") — React Router không tự làm việc này.
 * Chạy lại cả khi bấm lại cùng link (location.key đổi), cuộn mượt trừ khi người dùng bật "giảm chuyển động".
 */
export function useScrollToHash() {
  const { hash, key } = useLocation()
  const prefersReducedMotion = usePrefersReducedMotion()

  useEffect(() => {
    if (!hash) return
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(decodeURIComponent(hash.slice(1)))
      target?.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [hash, key, prefersReducedMotion])
}
