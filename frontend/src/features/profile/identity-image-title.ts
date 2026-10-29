/** "Mặt trước" → "Chọn ảnh mặt trước"; "Ảnh chân dung" → "Chọn ảnh chân dung" (không lặp chữ "ảnh") */
export function pickTitle(label: string): string {
  const lower = label.toLowerCase()
  return lower.startsWith('ảnh') ? `Chọn ${lower}` : `Chọn ảnh ${lower}`
}
