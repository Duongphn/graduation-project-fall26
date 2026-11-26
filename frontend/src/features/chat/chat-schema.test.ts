import { act, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderHookWithProviders } from '../../test/render'
import { uploadImage } from '../../services/upload'
import { chatImageProblem, CHAT_IMAGE_MAX_BYTES, CHAT_TEXT_MAX, validateChatMessage } from './chat-schema'
import { useChatAttachments } from './hooks/use-chat-attachments'

vi.mock('../../services/upload', () => ({ uploadImage: vi.fn() }))

// The first bytes of a real PNG, so the signature check accepts the file.
const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const png = (name: string, size = 1024) => {
  const bytes = new Uint8Array(Math.max(size, PNG_HEAD.length))
  bytes.set(PNG_HEAD)
  return new File([bytes], name, { type: 'image/png' })
}

describe('validateChatMessage', () => {
  it('needs text or at least one image', () => {
    expect(validateChatMessage('   ', 0)).toBe('Tin nhắn cần có nội dung hoặc ảnh.')
    expect(validateChatMessage('', 1)).toBeNull()
    expect(validateChatMessage('Chào bạn', 0)).toBeNull()
  })

  it('refuses more than 1000 characters and more than 5 images', () => {
    expect(validateChatMessage('a'.repeat(CHAT_TEXT_MAX), 0)).toBeNull()
    expect(validateChatMessage('a'.repeat(CHAT_TEXT_MAX + 1), 0)).toBe('Tin nhắn tối đa 1000 ký tự.')
    expect(validateChatMessage('Ảnh nè', 6)).toBe('Tối đa 5 ảnh mỗi tin nhắn.')
  })
})

describe('chatImageProblem', () => {
  it('accepts JPG, PNG and WebP up to 5 MB', () => {
    expect(chatImageProblem(png('lego.png'))).toBeNull()
    expect(chatImageProblem(new File(['x'], 'a.webp', { type: 'image/webp' }))).toBeNull()
  })

  it('refuses another format and a file over 5 MB', () => {
    expect(chatImageProblem(new File(['x'], 'scan.gif', { type: 'image/gif' }))).toBe(
      '"scan.gif" không phải ảnh JPG, PNG hoặc WebP.',
    )
    expect(chatImageProblem(png('big.png', CHAT_IMAGE_MAX_BYTES + 1))).toBe('"big.png" vượt quá 5 MB.')
  })
})

describe('useChatAttachments', () => {
  it('uploads up to 5 images as CHAT_IMAGE and refuses the rest', async () => {
    // jsdom has no object URLs
    URL.createObjectURL = vi.fn(() => 'blob:preview')
    URL.revokeObjectURL = vi.fn()
    vi.mocked(uploadImage).mockImplementation(async (_file, purpose) => ({
      publicId: `toyflow/chat/u1/${String(purpose)}`,
      url: 'https://cdn/x.png',
      format: 'png',
    }))
    const { result } = renderHookWithProviders(() => useChatAttachments())

    await act(() => result.current.addFiles([1, 2, 3, 4, 5, 6].map((index) => png(`anh-${index}.png`))))

    expect(result.current.items).toHaveLength(5)
    expect(result.current.rejections).toEqual(['Tối đa 5 ảnh mỗi tin nhắn.'])
    expect(uploadImage).toHaveBeenCalledWith(expect.any(File), 'CHAT_IMAGE', expect.any(Function))
    await waitFor(() => expect(result.current.readyCount).toBe(5))

    let taken: ReturnType<typeof result.current.take> | undefined
    act(() => {
      taken = result.current.take()
    })
    expect(taken?.images[0]).toEqual({ publicId: 'toyflow/chat/u1/CHAT_IMAGE', format: 'png' })
    expect(result.current.items).toHaveLength(0)
  })
})
