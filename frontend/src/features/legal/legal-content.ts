/**
 * Nội dung Điều khoản dịch vụ và Chính sách bảo mật (R03 1.1.1 (8)): tóm tắt các quy tắc nghiệp vụ GB-xx
 * và yêu cầu bảo mật của R03 bằng lời cho người dùng. Đổi quy tắc trong R03 thì sửa lại ở đây.
 */
export interface LegalSection {
  /** id của mục, dùng làm neo (#id) cho mục lục */
  id: string
  heading: string
  paragraphs?: string[]
  items?: string[]
}

export interface LegalDocument {
  title: string
  /** Ngày cập nhật hiển thị dưới tiêu đề */
  updatedAt: string
  intro: string
  sections: LegalSection[]
}

const UPDATED_AT = '20/11/2026'

/** Mục Liên hệ dùng chung cho hai văn bản */
const contactSection = (number: number): LegalSection => ({
  id: 'lien-he',
  heading: `${number}. Liên hệ`,
  paragraphs: [
    'ToyFlow là đồ án tốt nghiệp của nhóm sinh viên Trường Đại học FPT. Mọi câu hỏi, khiếu nại về điều khoản, giao dịch hoặc dữ liệu cá nhân được nhóm quản trị (Admin) xử lý qua các kênh trong ứng dụng:',
  ],
  items: [
    'Mở khiếu nại ngay trên đơn thuê hoặc đơn mua đang có vấn đề, để Admin xem xét cùng bằng chứng của đơn.',
    'Báo cáo vi phạm từ tin đăng, hồ sơ người dùng hoặc tin nhắn.',
  ],
})

export const TERMS_OF_SERVICE: LegalDocument = {
  title: 'Điều khoản dịch vụ',
  updatedAt: UPDATED_AT,
  intro:
    'ToyFlow là nền tảng để các gia đình cho thuê, mua bán và quyên góp đồ chơi trẻ em đã qua sử dụng với nhau. Khi tạo tài khoản và sử dụng ToyFlow, bạn đồng ý với các điều khoản dưới đây.',
  sections: [
    {
      id: 'tai-khoan',
      heading: '1. Tài khoản',
      items: [
        'Mỗi số điện thoại và mỗi email chỉ thuộc về một tài khoản. Tài khoản chỉ được tạo sau khi bạn xác minh email bằng mã OTP; mã có hạn 5 phút và mỗi email nhận tối đa 5 mã trong một giờ.',
        'Bạn tự bảo vệ mật khẩu của mình. Sau 5 lần đăng nhập sai liên tiếp, tài khoản bị tạm khoá 15 phút.',
        'Admin có thể khoá tài khoản vi phạm. Tài khoản bị khoá không đăng nhập được và tin đăng bị ẩn; các đơn đang diễn ra vẫn tiếp tục đến khi kết thúc.',
        'Tài khoản, giao dịch ví, đơn thuê, đơn mua và yêu cầu quyên góp không bị xoá vĩnh viễn, để giữ lịch sử đối soát.',
      ],
    },
    {
      id: 'xac-minh-danh-tinh',
      heading: '2. Xác minh danh tính',
      items: [
        'Bạn cần được xác minh danh tính (ảnh hai mặt CCCD và ảnh chân dung, Admin duyệt) trước khi đăng đồ chơi, thanh toán đơn hoặc gửi yêu cầu quyên góp.',
        'Chỉ người từ đủ 18 tuổi trở lên mới được xác minh. Admin đối chiếu ngày sinh trên CCCD và từ chối với lý do “Chưa đủ 18 tuổi” nếu không đạt.',
        'Bạn cam kết ảnh gửi lên là giấy tờ và khuôn mặt của chính mình. Giấy tờ giả hoặc của người khác là vi phạm nghiêm trọng.',
      ],
    },
    {
      id: 'dang-tin',
      heading: '3. Đăng đồ chơi',
      items: [
        'Tin mới hoặc vừa sửa ở trạng thái Chờ duyệt cho đến khi Admin duyệt; chỉ tin đã duyệt mới hiện trong danh sách công khai. Hình thức tin (cho thuê hoặc bán) không đổi được sau khi duyệt.',
        'Tin cho thuê cần 3–8 ảnh, tin bán 4–8 ảnh, tin quyên góp 3–10 ảnh (JPG, PNG hoặc WebP, tối đa 5 MB mỗi ảnh).',
        'Tiêu đề, mô tả và đánh giá không được chứa số điện thoại, email hoặc đường link: mọi giao dịch phải diễn ra trên ToyFlow để được bảo vệ.',
        'Mỗi tin phải khai báo thông tin an toàn (chi tiết nhỏ, nam châm nhỏ, pin cúc áo, dây; dấu hợp quy CR) và xác nhận đồ chơi đã được làm sạch, không vỡ hoặc có cạnh sắc. Đồ chơi có chi tiết nhỏ, nam châm nhỏ hoặc pin cúc áo chỉ dành cho trẻ từ 3 tuổi trở lên.',
      ],
    },
    {
      id: 'ky-quy-dat-coc',
      heading: '4. Ví, đặt cọc và ký quỹ',
      items: [
        'Bạn thanh toán bằng ví ToyFlow, nạp qua VNPay hoặc MoMo. Trong giai đoạn hiện tại, ví chạy trên môi trường thử nghiệm (sandbox) của cổng thanh toán và không giữ tiền thật.',
        'Khi thuê, bạn trả tiền thuê và tiền cọc cùng lúc; khi mua, bạn trả giá đồ chơi. ToyFlow giữ số tiền này (ký quỹ) cho đến khi đơn hoàn tất, rồi mới trả cho người cho thuê hoặc người bán.',
        'ToyFlow thu phí nền tảng trên tiền thuê và hoa hồng trên giá bán theo mức Admin công bố trong cài đặt hệ thống. Thay đổi phí chỉ áp dụng cho giao dịch tạo sau thời điểm thay đổi.',
        'Mỗi lần số dư thay đổi đều được ghi thành một giao dịch ví không sửa, không xoá được. Khi rút tiền, tài khoản ngân hàng phải đứng tên bạn, bạn cần đủ số dư khả dụng và không có tranh chấp đang mở.',
      ],
    },
    {
      id: 'quy-dinh-thue',
      heading: '5. Quy định thuê và mua',
      items: [
        'Mỗi lượt thuê dài 2–30 ngày và không trùng lịch với lượt thuê khác của cùng đồ chơi. Bạn không thể thuê hoặc mua đồ chơi của chính mình.',
        'Yêu cầu thuê được gửi cho chủ đồ chơi trước và chưa trừ tiền. Chủ không phản hồi trong 24 giờ thì yêu cầu kết thúc; sau khi chủ đồng ý, bạn phải thanh toán trong 12 giờ, nếu không lượt thuê bị huỷ.',
        'Mỗi lần giao nhận đều cần ảnh tình trạng đồ chơi và xác nhận “Đầy đủ như mô tả” hoặc “Thiếu chi tiết”. Người nhận không xác nhận trong 48 giờ thì hệ thống tự xác nhận là đầy đủ.',
        'Chủ có 48 giờ để kiểm tra đồ chơi trả về. Nếu đồ chơi tốt (hoặc hết hạn kiểm tra), chủ nhận tiền thuê trừ phí nền tảng cộng phí trả muộn nếu có, người thuê nhận lại tiền cọc trừ phí trả muộn.',
        'Người thuê hoặc người mua có thể mở tranh chấp trong 24 giờ sau khi nhận đồ, chủ đồ chơi trong thời gian kiểm tra; bên kia có 72 giờ để phản hồi. Trong lúc tranh chấp, tiền ký quỹ của đơn bị giữ nguyên; bồi thường tối đa bằng tiền cọc (thuê) hoặc giá bán (mua). Quyết định của Admin có lý do bằng văn bản và là quyết định cuối cùng.',
        'Người bán phải xác nhận đơn mua trong 24 giờ, nếu không đơn bị huỷ và hoàn tiền. Người mua không xác nhận đã nhận trong 3 ngày sau khi giao thì tiền được chuyển cho người bán.',
        'Điểm uy tín (Trust Score) từ 0 đến 100, bắt đầu ở 100. Người thuê có điểm dưới ngưỡng Admin đặt (mặc định 50) không thuê được đồ chơi có tiền cọc cao. Mỗi bên được đánh giá một lần cho mỗi đơn, trong 14 ngày sau khi đơn hoàn tất.',
        'ToyFlow không đặt, không trả phí và không theo dõi vận chuyển; hai bên tự thoả thuận cách giao nhận.',
      ],
    },
    {
      id: 'quy-dinh-quyen-gop',
      heading: '6. Quy định quyên góp',
      items: [
        'Bạn chỉ quyên góp được cho tổ chức đã được Admin kiểm tra và đang nhận đồ chơi, qua điểm nhận của tổ chức, hoặc cho người dùng đã gửi yêu cầu nhận đồ.',
        'Bên không tạo yêu cầu quyên góp là bên quyết định: Admin quyết định thay tổ chức với yêu cầu bạn gửi; bạn quyết định yêu cầu từ người nhận.',
        'Yêu cầu Chờ duyệt quá thời hạn (mặc định 14 ngày) sẽ hết hạn; yêu cầu đã chấp nhận mà không gửi đồ trong thời hạn cũng hết hạn.',
        'Bạn gửi đồ tại điểm nhận hoặc qua đơn vị vận chuyển tự chọn, kèm ảnh trước khi gửi. Yêu cầu chỉ hoàn tất khi bên nhận xác nhận đã nhận kèm ảnh.',
        'Đồ chơi đã quyên góp thành công không bao giờ được cho thuê hoặc bán lại. Tin cho thuê hoặc bán không chuyển thành tin quyên góp được: hãy ẩn tin và đăng tin quyên góp mới.',
      ],
    },
    {
      id: 'hanh-vi-cam',
      heading: '7. Hành vi bị cấm và xử lý vi phạm',
      items: [
        'Giao dịch ngoài nền tảng, đăng thông tin liên hệ để lôi kéo giao dịch ngoài ToyFlow.',
        'Đăng đồ chơi không an toàn, đã bị thu hồi hoặc cấm lưu hành, hoặc mô tả sai tình trạng đồ chơi.',
        'Tạo đơn giả, đánh giá giả, dùng giấy tờ của người khác hoặc gửi báo cáo vi phạm sai sự thật.',
        'Tuỳ mức độ, Admin có thể từ chối hoặc ẩn tin, hoặc khoá tài khoản.',
      ],
    },
    {
      id: 'ai',
      heading: '8. Gợi ý của AI',
      paragraphs: [
        'Trợ lý AI gợi ý đồ chơi theo độ tuổi và gợi ý hư hỏng khi so sánh ảnh giao nhận. Kết quả của AI chỉ mang tính tham khảo, không tự thay đổi tin đăng, đơn hay tranh chấp; người dùng và Admin luôn là người quyết định.',
      ],
    },
    contactSection(9),
  ],
}

export const PRIVACY_POLICY: LegalDocument = {
  title: 'Chính sách bảo mật',
  updatedAt: UPDATED_AT,
  intro:
    'Chính sách này cho biết ToyFlow thu thập những dữ liệu cá nhân nào, dùng vào việc gì, ai được xem và bạn có quyền gì với dữ liệu của mình.',
  sections: [
    {
      id: 'du-lieu-thu-thap',
      heading: '1. Dữ liệu chúng tôi thu thập',
      items: [
        'Thông tin tài khoản: họ tên, email, số điện thoại, mật khẩu (chỉ lưu dạng băm bcrypt, không ai đọc được), ảnh đại diện; ngày sinh, giới tính, giới thiệu ngắn nếu bạn tự điền.',
        'Địa chỉ giao nhận bạn lưu trong sổ địa chỉ.',
        'Hồ sơ xác minh danh tính: ảnh mặt trước, mặt sau CCCD, ảnh chân dung và số điện thoại liên hệ.',
        'Dữ liệu giao dịch: tin đăng, đơn thuê, đơn mua, yêu cầu quyên góp, ảnh giao nhận, giao dịch ví, đánh giá, tin nhắn và báo cáo vi phạm.',
        'Hồ sơ của trẻ (nếu bạn tạo): chỉ biệt danh, tháng và năm sinh, sở thích.',
      ],
    },
    {
      id: 'muc-dich',
      heading: '2. Mục đích sử dụng',
      items: [
        'Tạo và bảo vệ tài khoản: xác minh email bằng OTP, chống đoán mật khẩu, khôi phục mật khẩu.',
        'Xác minh danh tính để giảm gian lận giữa những người chưa quen biết.',
        'Thực hiện đơn thuê, mua, quyên góp; giữ tiền ký quỹ, thanh toán, hoàn tiền và giải quyết tranh chấp.',
        'Gửi thông báo trong ứng dụng và qua email về tài khoản và giao dịch của bạn.',
      ],
    },
    {
      id: 'anh-cccd',
      heading: '3. Ảnh CCCD và ảnh chân dung',
      items: [
        'Ảnh được lưu dưới dạng tệp riêng tư (không công khai) trên Cloudinary và được mã hoá khi truyền.',
        'Chỉ bạn và Admin đang duyệt hồ sơ mới mở được ảnh; mỗi lần xem dùng một đường link có chữ ký, hết hạn sau 10 phút.',
        'Ảnh chỉ dùng để xác minh danh tính và độ tuổi, không hiển thị cho người dùng khác. Sau khi được xác minh, ảnh được ẩn trên trang của bạn.',
      ],
    },
    {
      id: 'ai-duoc-xem',
      heading: '4. Ai được xem dữ liệu của bạn',
      items: [
        'Người dùng khác chỉ thấy thông tin công khai: họ tên, ảnh đại diện, huy hiệu đã xác minh, điểm uy tín, đánh giá và tin đăng.',
        'Địa chỉ và số điện thoại của bạn chỉ hiện cho bên kia của đơn hoặc lượt quyên góp đang diễn ra, và chỉ đến khi hoàn tất.',
        'Admin thấy dữ liệu cần cho việc duyệt, xử lý vi phạm và tranh chấp; trong danh sách quản trị, số điện thoại được che bớt.',
        'Dịch vụ bên ngoài chỉ nhận phần dữ liệu cần thiết: cổng thanh toán (VNPay, MoMo) nhận thông tin giao dịch nạp tiền; dịch vụ email nhận địa chỉ email để gửi mã và thông báo; Google nhận yêu cầu đăng nhập khi bạn chọn đăng nhập bằng Google; Cloudinary lưu ảnh.',
        'Trợ lý AI chỉ nhận độ tuổi và sở thích bạn nhập trong câu hỏi; không gửi hồ sơ trẻ, họ tên, thông tin liên hệ hay dữ liệu ví. ToyFlow không lưu số thẻ ngân hàng.',
      ],
    },
    {
      id: 'bao-ve',
      heading: '5. Bảo vệ và lưu trữ',
      items: [
        'Mọi kết nối giữa trình duyệt và ToyFlow dùng HTTPS; kết nối tới cơ sở dữ liệu cũng được mã hoá.',
        'Đăng xuất, đổi mật khẩu hoặc bị khoá tài khoản sẽ thu hồi phiên đăng nhập.',
        'Tài khoản, giao dịch ví, đơn và yêu cầu quyên góp được lưu lâu dài (không xoá vĩnh viễn) để đối soát và cung cấp cho cơ quan có thẩm quyền khi được yêu cầu; nhật ký kỹ thuật được dọn định kỳ.',
      ],
    },
    {
      id: 'quyen-cua-ban',
      heading: '6. Quyền của bạn',
      items: [
        'Xem và sửa thông tin cá nhân, ảnh đại diện và sổ địa chỉ trong trang Hồ sơ.',
        'Tắt các loại thông báo không bắt buộc trong trang Thông báo.',
        'Yêu cầu giải thích hoặc khiếu nại về việc xử lý dữ liệu cá nhân qua các kênh ở mục Liên hệ.',
      ],
    },
    contactSection(7),
  ],
}
