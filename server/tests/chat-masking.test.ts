import { describe, expect, it } from 'vitest';

import { CONTACT_MASK, maskContactDetails } from '../src/utils/contact-details.js';

// UC25 / GB-11: chat messages are masked with the same fixed patterns as the listing check.
describe('maskContactDetails (chat, GB-11)', () => {
  it.each([
    ['Gọi mình 0912 345 678 nhé', 'PHONE'],
    ['Zalo: +84 912.345.678', 'PHONE'],
    ['SĐT 091-234-5678', 'PHONE'],
    // E2E 26/11 #10: several spaces, dots or dashes between the groups.
    ['Gọi 0912  345  678', 'PHONE'],
    ['Gọi 0912   345   678 nhé', 'PHONE'],
    ['SĐT 0912 - 345 - 678', 'PHONE'],
    ['SĐT 0912 .. 345 .. 678', 'PHONE'],
    ['Zalo +84  912  345  678', 'PHONE'],
    ['Số 0  9  1  2  3  4  5  6  7  8', 'PHONE'],
    ['Bàn 024  3826  1234', 'PHONE'],
    ['Mail be.na@gmail.com nha', 'EMAIL'],
    ['Xem https://zalo.me/abc', 'LINK'],
    ['Vào www.shop-do-choi.vn', 'LINK'],
    ['STK 1903 6688 9999 01 Techcombank', 'BANK_ACCOUNT'],
    ['Chuyển vào 0451000123456', 'BANK_ACCOUNT'],
  ])('hides "%s" (%s)', (text, kind) => {
    const result = maskContactDetails(text);
    expect(result.kinds).toEqual([kind]);
    expect(result.text).toContain(CONTACT_MASK);
    expect(result.text).not.toMatch(/\d{4}/);
    expect(result.text).not.toMatch(/@|https?:|www\./);
  });

  it('keeps ordinary toy talk, prices and short numbers', () => {
    for (const text of [
      'Bộ Lego 1500 mảnh, giá 15.000.000đ, cọc 500000',
      'Bé 3 tuổi chơi được không? Mình lấy ngày 18/11/2026.',
      'Gấu bông Momo còn mới 95%',
      'tobot.vn có bán bản này', // bare domain: only an Admin hint for listings, not masked
      // Prices, dates and times joined by wide gaps are not phone numbers (E2E 26/11 #10).
      'Giá 84.000 - 120.000đ, size 0 - 3 tuổi',
      'Giá 1 500 000 - 2 000 000 đ',
      'Thuê từ 18-11-2026 - 25-11-2026',
      'Nhận đồ 01-12-2026  - 0912',
      'Giờ hẹn 08.30 - 10.30 - 12',
      'Kích thước 30  45  60 cm, nặng 2  kg',
    ]) {
      expect(maskContactDetails(text)).toEqual({ text, kinds: [] });
    }
  });

  it('masks every occurrence and lists each kind once', () => {
    const result = maskContactDetails(
      'Gọi 0912345678 hoặc 0987654321, mail a@b.vn, web https://x.vn/0912345678',
    );
    expect(result.text).toBe(
      `Gọi ${CONTACT_MASK} hoặc ${CONTACT_MASK}, mail ${CONTACT_MASK}, web ${CONTACT_MASK}`,
    );
    expect(result.kinds.sort()).toEqual(['EMAIL', 'LINK', 'PHONE']);
  });

  it('masks only the phone when another number sits next to it with a wide gap', () => {
    expect(maskContactDetails('Mua năm 2023 - 0912  345  678').text).toBe(
      `Mua năm 2023 - ${CONTACT_MASK}`,
    );
    expect(maskContactDetails('Gọi 0912  345  678, giá 150.000').text).toBe(
      `Gọi ${CONTACT_MASK}, giá 150.000`,
    );
  });

  it('keeps the punctuation that follows a link', () => {
    expect(maskContactDetails('Xem https://shopee.vn/abc, rồi gọi nhé.').text).toBe(
      `Xem ${CONTACT_MASK}, rồi gọi nhé.`,
    );
    expect(maskContactDetails('(www.shop.vn).').text).toBe(`(${CONTACT_MASK}).`);
  });

  it('keeps line breaks', () => {
    expect(maskContactDetails('Chào bạn\nSĐT 0912345678').text).toBe(
      `Chào bạn\nSĐT ${CONTACT_MASK}`,
    );
  });
});
