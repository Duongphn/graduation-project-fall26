import { useEffect, useRef } from 'react'

/**
 * Gắn `data-revealed` lên phần tử khi nó cuộn vào khung nhìn (chỉ một lần).
 * CSS quyết định hiệu ứng (xem `[data-reveal]` và `.reveal-text` trong public-layout.css),
 * nên hook không gây re-render.
 */
export function useRevealOnScroll<T extends HTMLElement>(threshold = 0.2) {
  const ref = useRef<T>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    // Trình duyệt quá cũ: hiện nội dung ngay thay vì để ẩn mãi
    if (!('IntersectionObserver' in window)) {
      node.dataset.revealed = ''
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        node.dataset.revealed = ''
        observer.disconnect()
      },
      { threshold, rootMargin: '0px 0px -6% 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [threshold])

  return ref
}
