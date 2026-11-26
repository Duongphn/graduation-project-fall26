import { useCallback, useEffect, useRef, useState } from 'react'

import { getErrorMessage } from '../../../services/api-error'
import { uploadImage } from '../../../services/upload'
import { hasImageSignature } from '../../../utils/image-signature'
import type { ChatImageInput } from '../chat-api'
import { CHAT_IMAGES_MAX, chatImageProblem } from '../chat-schema'

/** Một ảnh đang đính kèm: tải thẳng lên Cloudinary (CHAT_IMAGE, private) ngay khi chọn */
export interface ChatAttachment {
  key: string
  name: string
  previewUrl: string
  progress: number
  status: 'uploading' | 'done' | 'error'
  image?: ChatImageInput
  error?: string
}

let attachmentSequence = 0

/**
 * Ảnh đính kèm của ô soạn tin: kiểm tra định dạng, dung lượng, chữ ký file và số lượng (≤ 5),
 * tải lên với tiến độ, bỏ ảnh. `take()` trao ảnh đã tải cho tin sắp gửi và làm trống danh sách.
 */
export function useChatAttachments() {
  const [items, setItems] = useState<ChatAttachment[]>([])
  const [rejections, setRejections] = useState<string[]>([])
  // Bản mới nhất cho các hàm gọi từ sự kiện (thêm ảnh, gửi) và lúc rời phòng
  const itemsRef = useRef(items)
  useEffect(() => {
    itemsRef.current = items
  }, [items])

  // Rời phòng: trả lại bộ nhớ của ảnh xem trước chưa gửi
  useEffect(() => () => itemsRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl)), [])

  const update = (key: string, patch: Partial<ChatAttachment>) =>
    setItems((list) => list.map((item) => (item.key === key ? { ...item, ...patch } : item)))

  const upload = useCallback(async (key: string, file: File) => {
    try {
      const uploaded = await uploadImage(file, 'CHAT_IMAGE', (progress) => update(key, { progress }))
      update(key, {
        status: 'done',
        progress: 100,
        image: { publicId: uploaded.publicId, format: uploaded.format },
      })
    } catch (error) {
      update(key, { status: 'error', error: getErrorMessage(error, 'Tải ảnh lên không thành công.') })
    }
  }, [])

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const problems: string[] = []
      const accepted: File[] = []
      for (const file of Array.from(files)) {
        const problem = chatImageProblem(file) ?? ((await hasImageSignature(file)) ? null : `"${file.name}" bị hỏng hoặc không phải ảnh thật.`)
        if (problem) problems.push(problem)
        else accepted.push(file)
      }
      const room = CHAT_IMAGES_MAX - itemsRef.current.length
      if (accepted.length > room) problems.push(`Tối đa ${CHAT_IMAGES_MAX} ảnh mỗi tin nhắn.`)
      const added = accepted.slice(0, Math.max(room, 0)).map((file) => ({
        file,
        item: {
          key: `attachment-${++attachmentSequence}`,
          name: file.name,
          previewUrl: URL.createObjectURL(file),
          progress: 0,
          status: 'uploading' as const,
        },
      }))
      setRejections(problems)
      setItems((list) => [...list, ...added.map(({ item }) => item)])
      added.forEach(({ file, item }) => void upload(item.key, file))
    },
    [upload],
  )

  const remove = useCallback((key: string) => {
    setRejections([])
    setItems((list) => {
      const removed = list.find((item) => item.key === key)
      if (removed) URL.revokeObjectURL(removed.previewUrl)
      return list.filter((item) => item.key !== key)
    })
  }, [])

  /** Ảnh đã tải xong cho tin sắp gửi; ảnh xem trước giờ thuộc về tin đó (không thu hồi ở đây) */
  const take = useCallback(() => {
    const done = itemsRef.current.filter((item) => item.status === 'done' && item.image)
    itemsRef.current.filter((item) => !done.includes(item)).forEach((item) => URL.revokeObjectURL(item.previewUrl))
    setItems([])
    setRejections([])
    return {
      images: done.map((item) => item.image as ChatImageInput),
      previews: done.map((item) => item.previewUrl),
    }
  }, [])

  return {
    items,
    rejections,
    uploading: items.some((item) => item.status === 'uploading'),
    failed: items.some((item) => item.status === 'error'),
    readyCount: items.filter((item) => item.status === 'done').length,
    addFiles,
    remove,
    take,
  }
}
