import { z } from 'zod'

// Client-side rules of a chat message, the same as server constants/chat.ts and
// validations/chat.validation.ts, so the composer refuses what the server would refuse.

/** R03 (9): tối đa 1000 ký tự mỗi tin */
export const CHAT_TEXT_MAX = 1000
/** R03 (8): tối đa 5 ảnh mỗi tin */
export const CHAT_IMAGES_MAX = 5
/** JPG, PNG, WebP, tối đa 5 MB mỗi ảnh */
export const CHAT_IMAGE_MAX_BYTES = 5 * 1024 * 1024
export const CHAT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
/** R03 (5): mở phòng tải 50 tin gần nhất */
export const CHAT_PAGE_SIZE = 50
/** R03 (2): ô tìm cuộc trò chuyện tối đa 50 ký tự */
export const CHAT_SEARCH_MAX = 50

export const chatMessageSchema = z
  .object({
    text: z.string().max(CHAT_TEXT_MAX, `Tin nhắn tối đa ${CHAT_TEXT_MAX} ký tự.`),
    imageCount: z.number().int().max(CHAT_IMAGES_MAX, `Tối đa ${CHAT_IMAGES_MAX} ảnh mỗi tin nhắn.`),
  })
  .refine((value) => value.text.trim().length > 0 || value.imageCount > 0, {
    message: 'Tin nhắn cần có nội dung hoặc ảnh.',
    path: ['text'],
  })

/** Lỗi đầu tiên của tin sắp gửi, hoặc null khi gửi được */
export function validateChatMessage(text: string, imageCount: number): string | null {
  const result = chatMessageSchema.safeParse({ text, imageCount })
  return result.success ? null : (result.error.issues[0]?.message ?? 'Tin nhắn không hợp lệ.')
}

/** Lý do một ảnh bị loại (định dạng, dung lượng), hoặc null khi nhận được */
export function chatImageProblem(file: File): string | null {
  if (!(CHAT_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return `"${file.name}" không phải ảnh JPG, PNG hoặc WebP.`
  }
  if (file.size > CHAT_IMAGE_MAX_BYTES) return `"${file.name}" vượt quá 5 MB.`
  return null
}
