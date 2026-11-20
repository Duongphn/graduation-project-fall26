import { describe, expect, it } from 'vitest'

import { hasBlockedContactDetails } from './contact-details'

// Same samples as the server test (server/tests/contact-details.test.ts): the form refuses what the
// server refuses, and lets the weak hints through.
describe('hasBlockedContactDetails (GB-11)', () => {
  it('finds a phone number, an email address and an http/www link', () => {
    for (const text of [
      'Liên hệ 0912345678',
      'Gọi 0912 345 678 nhé',
      'Zalo 091.234.5678',
      'Gọi +84 912 345 678',
      'Máy bàn 024 3826 1234',
      'Hỏi qua be.na@gmail.com',
      'Xem thêm https://shopee.vn/lego-123',
      'Trang www.facebook.com/do-choi',
    ]) {
      expect(hasBlockedContactDetails(text), text).toBe(true)
    }
  })

  it('lets honest toy text through', () => {
    for (const text of [
      'Bộ đồ chơi ngân hàng mini cho bé tập tiết kiệm',
      'Gấu bông Momo màu hồng',
      'Mã vạch hộp 8936036022345',
      'Mẫu Labubu đang hot trên TikTok',
      'Robot Tobot.vn chính hãng',
      'Số seri 2023 0915 1234 trên đế xe',
      'Giá mua 1.250.000đ, kích thước 120 x 60 x 45 cm',
      'Awww.cute, bé rất thích',
    ]) {
      expect(hasBlockedContactDetails(text), text).toBe(false)
    }
  })
})
