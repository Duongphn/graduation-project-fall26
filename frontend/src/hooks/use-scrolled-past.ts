import { useEffect, useState } from 'react'

/**
 * true khi phần tử có id `elementId` đã cuộn khuất lên phía trên (bị header dính che hoặc ra khỏi màn hình).
 * Không truyền id → luôn true (không có gì để chờ).
 */
export function useScrolledPast(elementId: string | undefined, offsetTop = 0): boolean {
  const [scrolledPast, setScrolledPast] = useState(false)

  useEffect(() => {
    if (!elementId) return
    const element = document.getElementById(elementId)
    if (!element) return

    const observer = new IntersectionObserver(
      ([entry]) => setScrolledPast(!entry.isIntersecting && entry.boundingClientRect.top < offsetTop),
      // Trừ phần header dính để "khuất" nghĩa là khuất sau header, không chỉ ra khỏi cửa sổ
      { rootMargin: `-${offsetTop}px 0px 0px 0px` },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [elementId, offsetTop])

  return elementId ? scrolledPast : true
}
