import { describe, expect, it } from 'vitest';

import {
  ADVISOR_FAQ,
  type FaqTopic,
  findFaq,
  matchFaq,
  normalizeVietnamese,
} from '../src/services/ai-advisor.faq.js';

// 30 câu hỏi thực tế phụ huynh hay gõ: phải trả lời bằng FAQ, không gọi Gemini.
const FAQ_QUESTIONS: Array<[string, FaqTopic]> = [
  ['Tiền cọc được hoàn lại khi nào?', 'deposit'],
  ['Đặt cọc bao nhiêu thì được thuê?', 'deposit'],
  ['Phí thuê đồ chơi tính như thế nào?', 'fees'],
  ['ToyFlow có thu phí dịch vụ của người thuê không?', 'fees'],
  ['Trả đồ trễ 2 ngày thì bị phạt bao nhiêu?', 'late_return'],
  ['Quá ngày trả thì có bị trừ tiền cọc không?', 'late_return'],
  ['Lỡ làm hỏng đồ chơi thì có phải đền không?', 'damage'],
  ['Chủ đồ chơi báo hư hỏng nhưng tôi không đồng ý thì sao?', 'damage'],
  ['Thanh toán đơn thuê bằng cách nào?', 'payment'],
  ['Làm sao để nạp tiền vào ví?', 'payment'],
  ['Tôi muốn huỷ đơn thuê thì làm thế nào?', 'cancel'],
  ['Chủ đồ chơi chưa xác nhận yêu cầu thì sao?', 'cancel'],
  ['ToyFlow có giao hàng tận nhà không?', 'handover'],
  ['Phí ship ai trả?', 'handover'],
  ['Trả đồ như thế nào khi hết hạn thuê?', 'return'],
  ['Có gia hạn thời gian thuê được không?', 'extend'],
  ['Thuê tối đa được bao nhiêu ngày?', 'rental_period'],
  ['Có đặt trước lịch thuê được không?', 'rental_period'],
  ['Quy trình thuê đồ chơi gồm những bước nào?', 'how_to_rent'],
  ['Cách mua đồ chơi đang bán?', 'buy'],
  ['Bấm Mua món này không được là sao?', 'buy'],
  ['Làm sao để đăng tin cho thuê đồ chơi của tôi?', 'listing'],
  ['Tin đăng của tôi bao lâu thì được duyệt?', 'listing_review'],
  ['Tin đăng bị từ chối thì sửa thế nào?', 'listing_review'],
  ['Tại sao phải xác minh danh tính?', 'verification'],
  ['Điểm tin cậy là gì?', 'trust_score'],
  ['Đồ chơi cũ có được vệ sinh trước khi giao không?', 'safety'],
  ['Tôi muốn tặng đồ chơi cũ cho trẻ em khó khăn', 'donate'],
  ['Quên mật khẩu thì làm sao?', 'account'],
  ['Robo là ai, mỗi ngày hỏi được bao nhiêu lần?', 'ai_advisor'],
  // Cách hỏi khác của cùng các chủ đề (bộ câu gửi cho người test thủ công).
  ['Khi nào tôi được trả lại tiền cọc?', 'deposit'],
  ['Thuê 3 ngày thì tính tiền thế nào?', 'fees'],
  ['Lỡ trả muộn một hôm có sao không?', 'late_return'],
  ['Đồ chơi bị vỡ khi bé chơi thì xử lý ra sao?', 'damage'],
  ['Ví của tôi hết tiền, nạp tiền ở đâu?', 'payment'],
  ['Đã thanh toán rồi có huỷ được không?', 'cancel'],
  ['Bên cho thuê có ship đồ đến nhà không?', 'handover'],
  ['Muốn thuê thêm vài ngày nữa được không?', 'extend'],
  ['Đồ chơi đang bán thì đặt mua ở đâu?', 'buy'],
  ['Tôi muốn cho thuê đồ chơi của con mình thì làm sao?', 'listing'],
  ['Sao tin của tôi mãi chưa được duyệt?', 'listing_review'],
  ['Có cần xác thực CCCD mới thuê được không?', 'verification'],
  ['Đồ chơi cho thuê có được vệ sinh sạch không?', 'safety'],
  ['Tôi muốn quyên góp đồ chơi cho mái ấm', 'donate'],
  ['Không nhận được mã OTP khi đăng ký', 'account'],
  ['Bạn là ai vậy?', 'ai_advisor'],
];

// Câu tìm đồ chơi: phải để Gemini tư vấn, không được khớp nhầm FAQ.
const SEARCH_QUESTIONS = [
  'Bé 4 tuổi thích xếp hình, muốn thuê dưới 50k',
  'Bé 2 tuổi, tiền cọc thấp thôi',
  'Có xe điều khiển cho thuê không?',
  'Muốn mua đồ chơi cho bé gái',
  'Có búp bê nào đang bán không?',
  'Đồ chơi an toàn cho trẻ sơ sinh',
  'Tìm đồ trẻ sơ sinh giá rẻ',
  'Đồ chơi chất lượng tốt cho bé trai',
  'Có đồ chơi nấu ăn cho bé gái không?',
  'Bé nhà mình thích âm nhạc, gợi ý giúp với',
  'Có bộ lego nào cho thuê không?',
  'Có đồ chơi giáo dục nào giao được không?',
];

describe('advisor FAQ', () => {
  it.each(FAQ_QUESTIONS)('answers "%s" with the %s topic', (question, topic) => {
    expect(findFaq(question)?.topic).toBe(topic);
    expect(matchFaq(question)).toBe(findFaq(question)?.answer);
  });

  it.each(SEARCH_QUESTIONS)('leaves the toy search "%s" to the AI', (question) => {
    expect(findFaq(question)).toBeNull();
  });

  it('has 20 topics and tests every one of them', () => {
    const topics = ADVISOR_FAQ.map((entry) => entry.topic);
    expect(new Set(topics).size).toBe(20);
    expect(new Set(FAQ_QUESTIONS.map(([, topic]) => topic))).toEqual(new Set(topics));
  });

  it('writes every keyword in lower case without accents', () => {
    for (const entry of ADVISOR_FAQ) {
      for (const keyword of entry.keywords) expect(normalizeVietnamese(keyword)).toBe(keyword);
    }
  });

  it('strips Vietnamese accents', () => {
    expect(normalizeVietnamese('  Hủy ĐƠN   thuê ')).toBe('huy don thue');
    expect(normalizeVietnamese('Huỷ đơn')).toBe('huy don');
  });
});
