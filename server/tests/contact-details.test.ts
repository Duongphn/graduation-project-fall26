import { describe, expect, it } from 'vitest';

import {
  findContactDetails,
  hasBlockedContactDetails,
} from '../src/utils/contact-details.js';
import { buildModerationWarnings } from '../src/services/toy-moderation.warnings.js';

// R03 GB-11 in two tiers (decision L1 of 17/11/2026): a phone number, an email address or an
// http(s)/www link blocks the save; the weaker hints stay warnings for the Admin.
describe('GB-11 contact details', () => {
  it('blocks a Vietnamese phone number, written plain, spaced, dotted or with +84', () => {
    for (const text of [
      'Liên hệ 0912345678',
      'Gọi 0912 345 678 nhé',
      'Zalo 091.234.5678',
      'SĐT 0912-345-678',
      'Gọi +84 912 345 678',
      'Gọi +84912345678',
      'Máy bàn 024 3826 1234',
      // E2E 26/11 #10: several spaces, dots or dashes between the groups.
      'Gọi 0912  345  678',
      'Gọi 0912 - 345 - 678',
      'Gọi +84 . 912 . 345 . 678',
      'Năm 2023 - 0912 - 345 - 678',
    ]) {
      expect(hasBlockedContactDetails(text), text).toBe(true);
    }
  });

  it('warns the Admin about a phone split by wide gaps, not about prices or dates', () => {
    expect(findContactDetails('Liên hệ 0912 -- 345 -- 678').phone).toBe(true);
    for (const text of ['Giá 84.000 - 120.000đ', 'Thuê 18-11-2026 - 25-11-2026', 'Giờ 08.30 - 10.30 - 12']) {
      expect(findContactDetails(text), text).toEqual({ phone: false, bankAccount: false, link: false });
      expect(hasBlockedContactDetails(text), text).toBe(false);
    }
  });

  it('blocks an email address and a link that starts with http://, https:// or www.', () => {
    for (const text of [
      'Hỏi qua be.na@gmail.com',
      'Email: ToyFlow.Shop@Yahoo.com.vn',
      'Xem thêm https://shopee.vn/lego-123',
      'Ảnh thật tại http://example.com',
      'Trang www.facebook.com/do-choi',
      'Trang WWW.tobot.vn',
    ]) {
      expect(hasBlockedContactDetails(text), text).toBe(true);
    }
  });

  it('lets honest toy text through, even when it gives an Admin warning', () => {
    const honest = [
      'Bộ đồ chơi ngân hàng mini cho bé tập tiết kiệm',
      'Gấu bông Momo màu hồng',
      'Mã vạch hộp 8936036022345',
      'Mẫu Labubu đang hot trên TikTok',
      'Robot Tobot.vn chính hãng',
      'Số seri 2023 0915 1234 trên đế xe',
      'Giá mua 1.250.000đ, kích thước 120 x 60 x 45 cm',
      'LEGO 42115 Lamborghini Sián FKP 37, 3696 chi tiết',
      'Awww.cute, bé rất thích',
      'Gửi lời chúc @bé Na',
    ];
    for (const text of honest) {
      expect(hasBlockedContactDetails(text), text).toBe(false);
    }
    // The weak tier still flags several of them for the Admin, as before.
    expect(findContactDetails(honest[0] ?? '').bankAccount).toBe(true);
    expect(findContactDetails(honest[1] ?? '').bankAccount).toBe(true);
    expect(findContactDetails(honest[2] ?? '').bankAccount).toBe(true);
    expect(findContactDetails(honest[3] ?? '').link).toBe(true);
    expect(findContactDetails(honest[4] ?? '').link).toBe(true);
  });

  it('still warns the Admin about a strong pattern', () => {
    const warnings = buildModerationWarnings({
      listingType: 'rent',
      imageCount: 3,
      minPhotos: 3,
      text: 'Gọi 0912 345 678 hoặc xem https://shopee.vn',
      category: { name: 'Xe', status: 'active' },
      owner: { verificationStatus: 'verified', locked: false },
    });
    expect(warnings.map((warning) => warning.code)).toEqual(['CONTACT_PHONE', 'CONTACT_LINK']);
  });
});
