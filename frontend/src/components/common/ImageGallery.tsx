import { Empty, Image } from 'antd'

export interface GalleryImage {
  url?: string | null
  // Stable key; defaults to the URL.
  key?: string
  // Text alternative; defaults to "<label> – ảnh n".
  alt?: string
}

interface ImageGalleryProps {
  images: readonly (GalleryImage | string)[]
  size?: number
  // What the photos show, for the text alternative (R03 IV.2.1 Accessibility).
  label?: string
}

// Thumbnails with click-to-zoom (antd Image preview). Images without a URL (private assets
// whose signed link is not loaded yet) are skipped.
export function ImageGallery({ images, size = 96, label = 'Ảnh' }: ImageGalleryProps) {
  const visible = images
    .map((image) => (typeof image === 'string' ? { url: image } : image))
    .filter((image): image is GalleryImage & { url: string } => Boolean(image.url))
  if (visible.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có ảnh" />
  }
  return (
    <Image.PreviewGroup>
      <div className="flex flex-wrap gap-2">
        {visible.map((image, index) => (
          <Image
            key={image.key ?? image.url}
            src={image.url}
            alt={image.alt ?? `${label} – ảnh ${index + 1}`}
            width={size}
            height={size}
            className="rounded-lg border border-border object-cover"
          />
        ))}
      </div>
    </Image.PreviewGroup>
  )
}
