import { useEffect, useState } from 'react'

/** Sai số làm tròn của trình duyệt khi so vị trí cuộn với mép */
const EDGE_TOLERANCE_PX = 2
/** Mỗi lần bấm mũi tên cuộn khoảng 80% chiều rộng đang thấy (giữ lại vài mục cũ để không mất mạch) */
const SCROLL_RATIO = 0.8

/**
 * Dải cuộn ngang có mũi tên: cho biết còn nội dung ở bên trái/phải không và cuộn theo trang.
 * Dùng callback ref nên vẫn đúng khi dải chỉ xuất hiện sau (vd. tải lỗi rồi thử lại thành công).
 * Tự cập nhật khi cuộn, khi đổi kích thước và khi số mục bên trong thay đổi.
 */
export function useScrollArrows<T extends HTMLElement>() {
  const [element, setElement] = useState<T | null>(null)
  const [canScrollPrev, setCanScrollPrev] = useState(false)
  const [canScrollNext, setCanScrollNext] = useState(false)

  useEffect(() => {
    if (!element) return

    const update = () => {
      setCanScrollPrev(element.scrollLeft > EDGE_TOLERANCE_PX)
      setCanScrollNext(element.scrollLeft + element.clientWidth < element.scrollWidth - EDGE_TOLERANCE_PX)
    }

    update()
    const resizeObserver = new ResizeObserver(update)
    resizeObserver.observe(element)
    const mutationObserver = new MutationObserver(update)
    mutationObserver.observe(element, { childList: true, subtree: true })
    element.addEventListener('scroll', update, { passive: true })

    return () => {
      resizeObserver.disconnect()
      mutationObserver.disconnect()
      element.removeEventListener('scroll', update)
    }
  }, [element])

  const scrollByPage = (direction: 1 | -1) => {
    element?.scrollBy({ left: direction * element.clientWidth * SCROLL_RATIO, behavior: 'smooth' })
  }

  return { scrollerRef: setElement, canScrollPrev, canScrollNext, scrollByPage }
}
