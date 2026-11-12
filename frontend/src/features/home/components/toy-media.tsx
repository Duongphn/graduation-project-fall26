import { useState } from 'react'
import { getCategoryVisual } from '../home-content'
import type { HomeCategory } from '../home-api'
import { TONE_CLASSES } from '../home-styles'

interface ToyMediaProps {
  imageUrl?: string
  alt: string
  category?: HomeCategory
  /** Ảnh ở hero hiển thị ngay (eager); ảnh trong lưới tải lười */
  priority?: boolean
  className?: string
}

/**
 * Ảnh sản phẩm có khung tỉ lệ cố định (không giật layout khi ảnh tải xong).
 * Chưa có ảnh hoặc ảnh lỗi → ô màu theo danh mục, kèm ảnh minh hoạ (hoặc icon) và tên danh mục.
 */
export function ToyMedia({ imageUrl, alt, category, priority = false, className = '' }: ToyMediaProps) {
  const [failedUrl, setFailedUrl] = useState<string>()
  const { icon: Icon, tone, image: categoryImage } = getCategoryVisual(category?.slug)
  const showImage = imageUrl !== undefined && failedUrl !== imageUrl

  return (
    <div className={`relative size-full overflow-hidden ${TONE_CLASSES[tone]} ${className}`}>
      {showImage ? (
        <img
          src={imageUrl}
          alt={alt}
          className="size-full object-cover"
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          onError={() => setFailedUrl(imageUrl)}
        />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-2 p-3 text-center" aria-hidden>
          {categoryImage ? (
            // Rộng/cao 100% + object-cover: giữ đúng cách ảnh đang hiển thị (trước đây do rule
            // `.toy-card__media img` của trang tìm kiếm áp lên). Muốn ảnh nhỏ, không bị cắt:
            // đổi thành `size-3/5 object-contain`.
            <img
              src={categoryImage}
              alt=""
              className="h-full max-h-28 w-full object-cover drop-shadow-[0_6px_10px_rgb(18_23_31/0.15)]"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <span className="grid size-12 place-items-center rounded-xl border-2 border-current/30 bg-white/70 dark:bg-white/5 [&_svg]:size-6">
              <Icon />
            </span>
          )}
          {category && <span className="line-clamp-1 text-xs font-medium">{category.name}</span>}
        </div>
      )}
    </div>
  )
}
