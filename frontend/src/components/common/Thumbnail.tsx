import { PictureOutlined } from '@ant-design/icons'
import { Avatar, Typography } from 'antd'
import type { ReactNode } from 'react'

interface ThumbnailProps {
  src?: string | null
  alt?: string
  size?: number
  // Icon shown when there is no image or it fails to load.
  placeholder?: ReactNode
  // Text next to the image, e.g. the toy title.
  caption?: ReactNode
  description?: ReactNode
}

// Square image with a placeholder (toy photo, organization logo…), optionally with a caption.
export function Thumbnail({
  src,
  alt,
  size = 48,
  placeholder = <PictureOutlined />,
  caption,
  description,
}: ThumbnailProps) {
  const image = (
    <Avatar
      shape="square"
      size={size}
      src={src || undefined}
      alt={alt}
      icon={placeholder}
      className="shrink-0 border border-border bg-background text-muted"
    />
  )
  if (!caption) return image
  return (
    <div className="flex items-center gap-3">
      {image}
      <div className="flex min-w-0 flex-col">
        <Typography.Text strong ellipsis>
          {caption}
        </Typography.Text>
        {description && (
          <Typography.Text type="secondary" className="text-xs">
            {description}
          </Typography.Text>
        )}
      </div>
    </div>
  )
}
