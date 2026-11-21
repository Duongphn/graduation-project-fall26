import QRCode from 'qrcode'
import { useEffect, useState } from 'react'

interface VietQrImageProps {
  /** Nội dung VietQR (chuỗi EMVCo PayOS trả về) */
  value: string
  /** Mô tả cho trình đọc màn hình */
  label: string
}

/** Vẽ mã VietQR ngay trong trình duyệt (SVG), không gọi dịch vụ tạo ảnh bên ngoài */
export function VietQrImage({ value, label }: VietQrImageProps) {
  const [svg, setSvg] = useState<string>()

  useEffect(() => {
    let active = true
    QRCode.toString(value, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 })
      .then((markup) => {
        if (active) setSvg(markup)
      })
      .catch(() => {
        if (active) setSvg(undefined)
      })
    return () => {
      active = false
    }
  }, [value])

  return svg ? (
    <img
      src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
      alt={label}
      className="size-full [image-rendering:pixelated]"
    />
  ) : (
    <span role="img" aria-label="Đang tạo mã QR" className="block size-full animate-pulse rounded-lg bg-tf-surface" />
  )
}
