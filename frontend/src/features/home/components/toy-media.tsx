import { useState } from 'react'
import { getCategoryVisual } from '../home-content'
import type { HomeCategory } from '../home-api'

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
    <div className={`toy-media tone--${tone} ${className}`}>
      {showImage ? (
        <img
          src={imageUrl}
          alt={alt}
          className="toy-media__image"
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          onError={() => setFailedUrl(imageUrl)}
        />
      ) : (
        <div className="toy-media__placeholder" aria-hidden>
          {categoryImage ? (
            <img src={categoryImage} alt="" className="toy-media__placeholder-image" loading="lazy" decoding="async" />
          ) : (
            <span className="toy-media__placeholder-icon">
              <Icon />
            </span>
          )}
          {category && <span className="toy-media__placeholder-label">{category.name}</span>}
        </div>
      )}
    </div>
  )
}
