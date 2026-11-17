/**
 * R03 GB-11 (MSG22): tên và mô tả của tin thuê, bán, tặng không được có số điện thoại Việt Nam,
 * email, hoặc đường link bắt đầu bằng http://, https://, www. Cùng mẫu với backend
 * (server/src/utils/contact-details.ts), nên form báo lỗi trước khi gửi.
 *
 * Tên ngân hàng, ví điện tử, ứng dụng chat, dãy số dài, tên miền trơn ("Tobot.vn") không bị chặn:
 * dễ trùng với mô tả đồ chơi bình thường, nên chỉ là cảnh báo cho Admin khi duyệt tin.
 */

// Chữ số, giữa hai số có tối đa một dấu cách, chấm hoặc gạch: "0912 345 678", "091.234.5678"
const DIGIT_RUN = /\+?\d(?:[\s.-]?\d){7,}/g
// Di động (0 + 9 số) hoặc cố định (0 + 10 số), có thể bắt đầu bằng 84
const PHONE_DIGITS = /^(?:0|84)\d{9,10}$/
const EMAIL = /[\p{L}\p{N}._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/iu
// Không tính "www." nằm giữa một từ ("Awww.")
const URL_LINK = /(?<![\p{L}\p{N}])(?:https?:\/\/|www\.)\S/iu

const hasPhoneNumber = (text: string) =>
  Array.from(text.matchAll(DIGIT_RUN)).some((match) => PHONE_DIGITS.test(match[0].replace(/\D/g, '')))

export const hasBlockedContactDetails = (text: string) => {
  const value = text.normalize('NFC')
  return hasPhoneNumber(value) || EMAIL.test(value) || URL_LINK.test(value)
}

export type ContactField = 'title' | 'description'

/** MSG22, cùng câu backend trả về với mã CONTACT_DETAILS_NOT_ALLOWED */
export const CONTACT_DETAILS_MESSAGES: Record<ContactField, string> = {
  title: 'Không được ghi số điện thoại, email hoặc đường link trong tên đồ chơi.',
  description: 'Không được ghi số điện thoại, email hoặc đường link trong mô tả.',
}
