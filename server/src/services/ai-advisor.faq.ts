// Câu hỏi thường gặp trả lời ngay, không gọi Gemini và không tính lượt (US-03, BR-08, mục 8.7).
// Nội dung bám theo luồng thuê thật (rental-pricing.ts, rental-order.service.ts); không ghi con số
// cấu hình được (tỷ lệ phí, hệ số trễ hạn) vì Admin có thể đổi.

interface FaqEntry {
  topic: 'deposit' | 'fees' | 'how_to_rent' | 'verification';
  /** Cụm từ đã bỏ dấu, viết thường. */
  keywords: readonly string[];
  answer: string;
}

export const ADVISOR_FAQ: readonly FaqEntry[] = [
  {
    topic: 'deposit',
    keywords: ['tien coc', 'dat coc', 'hoan coc', 'tra coc', 'coc bao nhieu', 'mat coc'],
    answer:
      'Tiền cọc do chủ đồ chơi đặt cho từng tin và hiện trên trang chi tiết. Khi thuê, bạn thanh toán tiền thuê cùng tiền cọc qua ví ToyFlow; ToyFlow giữ khoản cọc trong suốt thời gian thuê. Trả đồ đúng hạn và còn nguyên vẹn thì tiền cọc được hoàn về ví của bạn. Nếu trả trễ, phí trễ hạn được trừ vào cọc (không vượt quá số cọc); nếu đồ chơi bị hư hỏng, chủ đồ chơi báo kèm bằng chứng để ToyFlow xem xét.',
  },
  {
    topic: 'fees',
    keywords: [
      'phi thue',
      'phi dich vu',
      'phi nen tang',
      'tinh phi',
      'mat phi',
      'phi tre',
      'tra tre',
      'tra muon',
      'qua han',
    ],
    answer:
      'Tiền thuê = số ngày thuê × giá thuê mỗi ngày ghi trên tin (tính cả ngày nhận và ngày trả). Bạn thanh toán tiền thuê và tiền cọc qua ví ToyFlow, không phải trả thêm phí dịch vụ: phí nền tảng được trừ vào phần tiền chủ đồ chơi nhận. Trả đồ trễ hạn sẽ bị tính phí theo số ngày trễ và trừ vào tiền cọc.',
  },
  {
    topic: 'how_to_rent',
    keywords: [
      'cach thue',
      'thue nhu the nao',
      'thue the nao',
      'quy trinh thue',
      'cac buoc thue',
      'lam sao de thue',
      'lam sao thue',
    ],
    answer:
      'Các bước thuê trên ToyFlow: 1) Mở tin "Cho thuê", chọn ngày nhận và ngày trả rồi gửi yêu cầu. 2) Chủ đồ chơi đồng ý yêu cầu. 3) Bạn thanh toán tiền thuê và tiền cọc từ ví ToyFlow trong thời hạn quy định. 4) Khi giao nhận, hai bên chụp ảnh tình trạng đồ chơi. 5) Hết hạn thuê, bạn trả đồ kèm ảnh; chủ đồ chơi xác nhận xong thì tiền cọc được hoàn. Bạn cần xác minh danh tính trước khi thuê.',
  },
  {
    topic: 'verification',
    keywords: ['xac minh', 'xac thuc', 'cccd', 'can cuoc', 'dinh danh'],
    answer:
      'Bạn cần xác minh danh tính (CCCD) trước khi thuê, đăng tin hoặc quyên góp đồ chơi. Vào Hồ sơ của tôi → Xác minh danh tính và tải ảnh giấy tờ theo hướng dẫn; Admin sẽ duyệt hồ sơ của bạn.',
  },
];

/** Viết thường, bỏ dấu tiếng Việt, gộp khoảng trắng. */
export const normalizeVietnamese = (text: string): string =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();

// Có tuổi hoặc số tiền cụ thể thì là câu tìm đồ chơi ("thuê xe cho bé 4 tuổi, cọc dưới 200k").
const SEARCH_SIGNAL = /\d+\s*(tuoi|thang|k\b|nghin|ngan|tr\b|trieu|d\b|dong|vnd)/;

/** Câu trả lời FAQ khớp với câu hỏi, hoặc null khi cần tư vấn bằng AI. */
export const matchFaq = (message: string): string | null => {
  const text = normalizeVietnamese(message);
  if (!text || SEARCH_SIGNAL.test(text)) return null;
  return ADVISOR_FAQ.find((entry) => entry.keywords.some((k) => text.includes(k)))?.answer ?? null;
};
