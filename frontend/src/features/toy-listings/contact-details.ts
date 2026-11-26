/**
 * R03 GB-11 (MSG22): tên và mô tả của tin thuê, bán, tặng không được có số điện thoại Việt Nam,
 * email, hoặc đường link bắt đầu bằng http://, https://, www. Cùng mẫu với backend
 * (server/src/utils/contact-details.ts), nên form báo lỗi trước khi gửi.
 *
 * Tên ngân hàng, ví điện tử, ứng dụng chat, dãy số dài, tên miền trơn ("Tobot.vn") không bị chặn:
 * dễ trùng với mô tả đồ chơi bình thường, nên chỉ là cảnh báo cho Admin khi duyệt tin.
 */

// A digit group: at most one space, dot or dash between two digits ("0912 345 678", "091.234.5678")
const DIGIT_GROUP = /\+?\d(?:[\s.-]?\d)*/g
// Di động (0 + 9 số) hoặc cố định (0 + 10 số), có thể bắt đầu bằng 84
const PHONE_DIGITS = /^(?:0|84)\d{9,10}$/
// Groups split by wider gaps ("0912  345  678", "0912 - 345 - 678") count only when they follow the
// VN numbering plan, start like a phone and hold no date or time, so prices and dates pass
const GAP = /^[\s.-]+$/
const GAPPED_PHONE_DIGITS = /^(?:0|84)(?:[35789]\d{8}|2\d{9})$/
const DATE_OR_TIME = /^(?:\d{1,2}[.-]\d{1,2}(?:[.-]\d{2,4})?|\d{4}-\d{1,2}-\d{1,2})$/
const MAX_PHONE_DIGITS = 12
const EMAIL = /[\p{L}\p{N}._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/iu
// Không tính "www." nằm giữa một từ ("Awww.")
const URL_LINK = /(?<![\p{L}\p{N}])(?:https?:\/\/|www\.)\S/iu

const onlyDigits = (value: string) => value.replace(/\D/g, '')

// Same scan as the server (scanDigitRuns): one phone number may span several groups
const hasPhoneNumber = (text: string) => {
  const groups = Array.from(text.matchAll(DIGIT_GROUP), (match) => ({
    start: match.index,
    end: match.index + match[0].length,
    text: match[0],
  }))
  return groups.some((head, first) => {
    if (PHONE_DIGITS.test(onlyDigits(head.text))) return true
    if (!(/^[0+]/.test(head.text) || head.text === '84') || DATE_OR_TIME.test(head.text)) return false
    let digits = onlyDigits(head.text)
    for (let next = first + 1; next < groups.length; next += 1) {
      const group = groups[next]
      const previous = groups[next - 1]
      if (!group || !previous) break
      if (!GAP.test(text.slice(previous.end, group.start)) || DATE_OR_TIME.test(group.text)) break
      digits += onlyDigits(group.text)
      if (digits.length > MAX_PHONE_DIGITS) break
      if (GAPPED_PHONE_DIGITS.test(digits)) return true
    }
    return false
  })
}

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
