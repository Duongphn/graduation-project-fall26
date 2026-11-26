import QRCode from 'qrcode'

/**
 * Tải mã VietQR thành ảnh PNG: người dùng đang ở trên điện thoại không quét được QR trên chính
 * màn hình của mình, nên lưu ảnh rồi chọn "quét ảnh từ thư viện" trong app ngân hàng.
 */
export async function downloadVietQr(value: string, fileName: string) {
  const dataUrl = await QRCode.toDataURL(value, { errorCorrectionLevel: 'M', margin: 2, width: 640 })
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
}
