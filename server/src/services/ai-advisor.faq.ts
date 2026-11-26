// Câu hỏi thường gặp trả lời ngay, không gọi Gemini.
// Nội dung bám theo luồng thật trong code (rental-*.ts, toy-listing.service.ts, donation, auth,
// trang chi tiết đồ chơi); không ghi con số Admin cấu hình được (tỷ lệ phí, hệ số trễ hạn,
// số giờ chờ, số ngày thuê tối đa).
//
// Thứ tự quan trọng: chủ đề đứng trước được ưu tiên khi trùng từ khoá. Tránh từ khoá dễ khớp
// nhầm câu tìm đồ chơi ("cho thuê", "mua đồ", "đang bán", "an toàn", "đồ trẻ"...).

export type FaqTopic =
  | 'late_return'
  | 'damage'
  | 'deposit'
  | 'fees'
  | 'payment'
  | 'cancel'
  | 'donate'
  | 'handover'
  | 'return'
  | 'extend'
  | 'rental_period'
  | 'how_to_rent'
  | 'buy'
  | 'listing_review'
  | 'listing'
  | 'verification'
  | 'trust_score'
  | 'safety'
  | 'account'
  | 'ai_advisor';

interface FaqEntry {
  topic: FaqTopic;
  /** Cụm từ đã bỏ dấu, viết thường (normalizeVietnamese). */
  keywords: readonly string[];
  answer: string;
}

export const ADVISOR_FAQ: readonly FaqEntry[] = [
  {
    topic: 'late_return',
    keywords: [
      'tra tre',
      'tra muon',
      'tra cham',
      'tra do tre',
      'tra do muon',
      'tra do cham',
      'tre han',
      'phi tre',
      'phat tre',
      'qua han tra',
      'qua ngay tra',
    ],
    answer:
      'Trả đồ chơi sau ngày hết hạn sẽ bị tính phí trễ hạn theo số ngày trễ và giá thuê mỗi ngày (theo mức ToyFlow quy định). Phí này được trừ vào tiền cọc và không vượt quá số tiền cọc. ToyFlow gửi thông báo nhắc trước ngày trả và khi đơn đã quá hạn để bạn kịp trả đồ.',
  },
  {
    topic: 'damage',
    keywords: [
      'hu hong',
      'lam hong',
      'bi hong',
      'hong do',
      'lam vo',
      'bi vo',
      'tranh chap',
      'boi thuong',
      'den bu',
    ],
    answer:
      'Khi nhận lại đồ chơi, chủ tin kiểm tra rồi xác nhận "Tốt" hoặc báo hư hỏng kèm mô tả và ảnh chụp trong thời hạn quy định. Nếu báo hư hỏng, đơn chuyển sang tranh chấp để ToyFlow xem xét dựa trên ảnh chụp lúc giao và lúc trả; tiền cọc được giữ lại cho tới khi có kết quả. Quá thời hạn mà chủ tin không báo gì, đơn tự hoàn tất như "Tốt" và tiền cọc được hoàn. Vì vậy bạn nên chụp ảnh rõ tình trạng đồ chơi khi nhận và khi trả.',
  },
  {
    topic: 'deposit',
    keywords: [
      'tien coc',
      'dat coc',
      'hoan coc',
      'tra coc',
      'lay lai coc',
      'coc bao nhieu',
      'mat coc',
    ],
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
      'tinh tien',
      'tien thue tinh',
      'hoa hong',
    ],
    answer:
      'Tiền thuê = số ngày thuê × giá thuê mỗi ngày ghi trên tin (tính cả ngày nhận và ngày trả). Bạn thanh toán tiền thuê và tiền cọc qua ví ToyFlow, không phải trả thêm phí dịch vụ: phí nền tảng được trừ vào phần tiền chủ đồ chơi nhận.',
  },
  // Đứng trước 'payment': "Đã thanh toán rồi có huỷ được không?" là câu hỏi về huỷ đơn.
  {
    topic: 'cancel',
    keywords: [
      'huy don',
      'huy thue',
      'huy yeu cau',
      'huy duoc',
      'muon huy',
      'khong muon thue nua',
      'doi y',
      'chua xac nhan',
      'chua dong y',
      'don bi tu choi',
      'yeu cau bi tu choi',
      'tu choi don',
      'tu choi yeu cau',
    ],
    answer:
      'Sau khi bạn gửi yêu cầu thuê, chủ đồ chơi có thời hạn để đồng ý hoặc từ chối; quá hạn không phản hồi thì yêu cầu tự hết hạn và bạn chưa bị trừ tiền. Sau khi chủ đồng ý, nếu bạn không thanh toán trong thời hạn thì đơn cũng tự hết hạn. Hiện ứng dụng chưa có nút để người thuê tự huỷ đơn, kể cả đơn đã thanh toán.',
  },
  {
    topic: 'payment',
    keywords: [
      'thanh toan',
      'nap tien',
      'nap vi',
      'so du',
      'vi toyflow',
      'tien trong vi',
      'chuyen khoan',
      'tra tien',
    ],
    answer:
      'Đơn thuê được thanh toán bằng số dư ví ToyFlow (tiền thuê cộng tiền cọc), trong thời hạn quy định sau khi chủ đồ chơi đồng ý; quá hạn chưa thanh toán thì yêu cầu thuê tự hết hạn. Hiện ToyFlow chưa mở nạp ví trực tuyến: quản trị viên ToyFlow nạp tiền vào ví giúp bạn. Tiền cọc được hoàn cũng trả về ví.',
  },
  {
    topic: 'donate',
    keywords: [
      'quyen gop',
      'tang do',
      'do tang',
      'cho tang',
      'nhan tang',
      'tang mien phi',
      'tu thien',
      'xin do',
    ],
    answer:
      'Robo chỉ gợi ý đồ chơi cho thuê và đang bán. Nếu muốn tặng đồ chơi, vào Quyên góp → Tạo phiếu quyên góp: cần xác minh danh tính, ít nhất 3 ảnh chụp thật và đồng ý các cam kết an toàn; bạn chọn tổ chức nhận hoặc để ToyFlow ghép. Phiếu được Admin kiểm duyệt an toàn; khi được duyệt, tổ chức sẽ gửi yêu cầu nhận và bạn gửi đồ theo yêu cầu đó.',
  },
  {
    topic: 'handover',
    keywords: [
      'giao hang',
      'giao nhan',
      'van chuyen',
      'ship',
      'giao den',
      'giao tan nha',
      'gap truc tiep',
      'nhan duoc do',
      'nhan hang',
    ],
    answer:
      'ToyFlow không vận chuyển, không chọn đơn vị giao hàng và không tính phí giao: hai bên tự thoả thuận cách giao nhận. Khi giao, chủ đồ chơi chụp ảnh tình trạng đồ chơi trên ứng dụng; khi nhận, bạn xác nhận đã nhận kèm ảnh. Nếu bạn không xác nhận trong thời hạn, hệ thống tự ghi nhận là đã nhận đồ.',
  },
  {
    topic: 'return',
    keywords: [
      'cach tra do',
      'tra do the nao',
      'tra do nhu the nao',
      'tra lai do',
      'tra do choi',
      'het han thue',
      'den han tra',
    ],
    answer:
      'Đến ngày hết hạn, vào Đơn thuê của tôi, chọn trả đồ và chụp ảnh tình trạng đồ chơi khi bàn giao lại. Chủ đồ chơi kiểm tra rồi xác nhận "Tốt" hoặc báo hư hỏng. Khi xác nhận "Tốt", tiền cọc (trừ phí trễ hạn nếu có) được hoàn về ví của bạn.',
  },
  {
    topic: 'extend',
    keywords: ['gia han', 'thue them', 'keo dai', 'them ngay thue', 'muon them ngay'],
    answer:
      'Hiện ToyFlow chưa có chức năng gia hạn đơn thuê. Nếu muốn dùng tiếp, bạn đặt thêm một đơn thuê mới cho những ngày tiếp theo khi lịch của đồ chơi còn trống; đơn hiện tại vẫn cần trả đúng hạn để tránh phí trễ.',
  },
  {
    topic: 'rental_period',
    keywords: [
      'thue toi da',
      'thue toi thieu',
      'thue bao lau',
      'thue duoc bao lau',
      'bao nhieu ngay',
      'dat truoc',
      'dat lich',
      'lich trong',
    ],
    answer:
      'Bạn chọn ngày nhận và ngày trả ngay trên trang chi tiết đồ chơi; lịch hiển thị những ngày đã có người thuê. Ngày bắt đầu phải từ hôm nay trở đi; số ngày thuê tối đa và khoảng thời gian được đặt trước theo quy định của ToyFlow, chọn quá thì hệ thống sẽ báo. Số ngày thuê tính cả ngày nhận và ngày trả.',
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
    topic: 'buy',
    keywords: [
      'cach mua',
      'mua the nao',
      'mua nhu the nao',
      'dat mua',
      'mua online',
      'mua truc tuyen',
      'mua mon nay',
    ],
    answer:
      'Tin "Mua lại" hiển thị giá bán và tình trạng do chủ đồ chơi đăng. Chức năng đặt mua trực tuyến trên ToyFlow sắp ra mắt, hiện nút "Mua món này" chưa dùng được.',
  },
  {
    topic: 'listing_review',
    keywords: [
      'duyet tin',
      'kiem duyet tin',
      'tin cho duyet',
      'duoc duyet',
      'tin bi tu choi',
      'tin dang bi tu choi',
      'sua tin',
      'an tin',
      'xoa tin',
      'go tin',
    ],
    answer:
      'Tin mới đăng ở trạng thái chờ duyệt cho tới khi Admin kiểm duyệt; bạn nhận thông báo khi tin được duyệt hoặc bị từ chối (kèm lý do). Vào Tin đăng của tôi để sửa, ẩn hoặc xoá tin. Tin đang có đơn chưa hoàn tất thì tạm thời không sửa, ẩn hay xoá được.',
  },
  {
    topic: 'listing',
    keywords: [
      'dang tin',
      'dang do choi',
      'cach dang',
      'muon cho thue do',
      'muon ban do choi cua',
      'ban lai do choi cua',
    ],
    answer:
      'Bạn cần xác minh danh tính trước khi đăng tin. Vào Đăng tin, nhập tên, danh mục, độ tuổi, tình trạng, chọn cho thuê (giá mỗi ngày và tiền cọc) hoặc bán (giá bán), kèm 1–10 ảnh chụp thật. Tin được Admin kiểm duyệt trước khi hiển thị cho mọi người.',
  },
  {
    topic: 'verification',
    keywords: ['xac minh', 'xac thuc', 'cccd', 'can cuoc', 'dinh danh', 'ekyc'],
    answer:
      'Bạn cần xác minh danh tính (CCCD) trước khi thuê, đăng tin hoặc quyên góp đồ chơi. Vào Hồ sơ của tôi → Xác minh danh tính và tải ảnh giấy tờ theo hướng dẫn; Admin sẽ duyệt hồ sơ của bạn.',
  },
  {
    topic: 'trust_score',
    keywords: ['diem tin cay', 'do tin cay', 'uy tin', 'bi han che', 'han che thue'],
    answer:
      'Mỗi tài khoản có điểm tin cậy từ 0 đến 100 do ToyFlow quản lý. Nếu điểm thấp hơn mức tối thiểu ToyFlow quy định, bạn tạm thời chưa thuê được đồ chơi. Ngoài ra, để thuê cần tài khoản đã xác minh danh tính và không thể thuê đồ chơi của chính mình.',
  },
  {
    topic: 'safety',
    keywords: ['ve sinh', 'co sach khong', 'an toan khong', 'giong hinh', 'kiem duyet'],
    answer:
      'Mọi tin đăng đều được Admin kiểm duyệt trước khi hiển thị; tình trạng đồ chơi do chủ tin mô tả kèm ảnh chụp thật. Khi giao và nhận, hai bên chụp ảnh tình trạng trên ứng dụng để đối chiếu. ToyFlow khuyên bố mẹ vệ sinh lại đồ chơi và kiểm tra các chi tiết nhỏ (nhất là với bé dưới 3 tuổi) trước khi cho bé chơi.',
  },
  {
    topic: 'account',
    keywords: [
      'quen mat khau',
      'lay lai mat khau',
      'dang ky',
      'tao tai khoan',
      'dang nhap',
      'google',
      'ma otp',
      'ma xac nhan',
      'khong nhan duoc ma',
    ],
    answer:
      'Bạn đăng ký bằng email và xác nhận bằng mã gửi qua email, hoặc đăng nhập nhanh bằng tài khoản Google. Quên mật khẩu: ở trang Đăng nhập chọn Quên mật khẩu, nhập email để nhận mã xác nhận rồi đặt mật khẩu mới. Không thấy mã thì kiểm tra thư rác hoặc yêu cầu gửi lại mã.',
  },
  {
    topic: 'ai_advisor',
    keywords: [
      'robo la ai',
      'ban la ai',
      'het luot',
      'gioi han luot',
      'luot hoi',
      'duoc hoi bao nhieu',
      'hoi duoc bao nhieu',
    ],
    answer:
      'Robo là trợ lý AI của ToyFlow, gợi ý đồ chơi cho thuê hoặc đang bán theo tuổi, sở thích và ngân sách của bé. Robo chỉ gợi ý, bố mẹ luôn là người quyết định. Mỗi tài khoản có giới hạn số lượt hỏi mỗi ngày; các câu hỏi thường gặp như phí, tiền cọc, cách thuê không tính lượt.',
  },
];

/** Viết thường, bỏ dấu tiếng Việt, gộp khoảng trắng. */
export const normalizeVietnamese = (text: string): string =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();

// Có tuổi hoặc số tiền cụ thể thì là câu tìm đồ chơi ("thuê xe cho bé 4 tuổi, cọc dưới 200k").
const SEARCH_SIGNAL = /\d+\s*(tuoi|thang|k\b|nghin|ngan|tr\b|trieu|d\b|dong|vnd)/;

/** Chủ đề FAQ khớp với câu hỏi, hoặc null khi cần tư vấn bằng AI. */
export const findFaq = (message: string): FaqEntry | null => {
  const text = normalizeVietnamese(message);
  if (!text || SEARCH_SIGNAL.test(text)) return null;
  return ADVISOR_FAQ.find((entry) => entry.keywords.some((k) => text.includes(k))) ?? null;
};

/** Câu trả lời FAQ khớp với câu hỏi, hoặc null khi cần tư vấn bằng AI. */
export const matchFaq = (message: string): string | null => findFaq(message)?.answer ?? null;
