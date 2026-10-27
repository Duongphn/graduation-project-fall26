import { Fragment, type CSSProperties } from 'react'
import { useRevealOnScroll } from '../../hooks/use-reveal-on-scroll'

interface RevealTextProps {
  text: string
  as?: 'h1' | 'h2'
  className?: string
}

/**
 * Tiêu đề hiện dần từng từ khi cuộn tới.
 * Chỉ tách theo khoảng trắng (không tách ký tự) để dấu tiếng Việt luôn đi liền với chữ.
 * Trình đọc màn hình đọc câu nguyên vẹn ở bản `sr-only`, phần chữ chuyển động bị ẩn khỏi cây truy cập.
 */
export function RevealText({ text, as: Tag = 'h2', className }: RevealTextProps) {
  const ref = useRevealOnScroll<HTMLHeadingElement>()
  const words = text.split(/\s+/).filter(Boolean)

  return (
    <Tag ref={ref} className={className ? `reveal-text ${className}` : 'reveal-text'}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {words.map((word, index) => (
          <Fragment key={index}>
            <span className="reveal-text__word">
              <span className="reveal-text__inner" style={{ '--i': index } as CSSProperties}>
                {word}
              </span>
            </span>
            {index < words.length - 1 ? ' ' : null}
          </Fragment>
        ))}
      </span>
    </Tag>
  )
}
