/**
 * Kiểm tra vài byte đầu của file ảnh có đúng chữ ký JPG / PNG / WebP như loại file khai báo không,
 * giống `validateToyImage` ở server. File đổi đuôi thành .png nhưng không phải ảnh thì bị chặn ngay ở
 * trình duyệt thay vì chờ server trả lỗi.
 */
const SIGNATURES: Record<string, (bytes: Uint8Array) => boolean> = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, i) => b[i] === byte),
  // "RIFF" .... "WEBP"
  'image/webp': (b) =>
    [0x52, 0x49, 0x46, 0x46].every((byte, i) => b[i] === byte) &&
    [0x57, 0x45, 0x42, 0x50].every((byte, i) => b[i + 8] === byte),
}

const readHead = (file: Blob, length: number) =>
  new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(file.slice(0, length))
  })

/** true khi nội dung khớp loại ảnh khai báo; loại khác hoặc không đọc được file thì để server quyết định */
export async function hasImageSignature(file: File): Promise<boolean> {
  const matches = SIGNATURES[file.type === 'image/jpg' ? 'image/jpeg' : file.type]
  if (!matches) return true
  try {
    return matches(await readHead(file, 12))
  } catch {
    return true
  }
}
