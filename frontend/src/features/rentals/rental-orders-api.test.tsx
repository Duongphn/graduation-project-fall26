import { act, screen } from '@testing-library/react'
import { AxiosError, AxiosHeaders } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { httpClient } from '../../services/http-client'
import { renderHookWithProviders } from '../../test/render'
import { useRentalHandover } from './rental-orders-api'

vi.mock('../../services/http-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/http-client')>()),
  httpClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

const post = vi.mocked(httpClient.post)

const serverError = (code: string, message: string, details?: unknown) =>
  new AxiosError('refused', 'ERR_BAD_REQUEST', undefined, undefined, {
    status: 400,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: { success: false, error: { code, message, details } },
  })

const ship = async (error: AxiosError) => {
  post.mockRejectedValueOnce(error)
  const { result } = renderHookWithProviders(() => useRentalHandover('64b000000000000000000031', 'ship'))
  await act(async () => {
    await result.current.mutateAsync([new File(['x'], 'a.png', { type: 'image/png' })]).catch(() => undefined)
  })
}

beforeEach(() => post.mockReset())

// Review 20/11, rental bug 3: image errors from the server were shown in English.
describe('rental photo steps: server image errors', () => {
  it('shows a Vietnamese message instead of "Image content does not match PNG file signature."', async () => {
    await ship(serverError('INVALID_IMAGE_FORMAT', 'Image content does not match PNG file signature.'))
    expect(
      await screen.findByText('Ảnh bị hỏng hoặc không phải ảnh JPG, PNG, WebP thật. Vui lòng chụp hoặc chọn ảnh khác.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/does not match/)).not.toBeInTheDocument()
  })

  it('translates the upload limits from multer', async () => {
    await ship(serverError('INVALID_IMAGE_UPLOAD', 'Each image must be at most 5 MB.', { code: 'LIMIT_FILE_SIZE' }))
    expect(await screen.findByText('Mỗi ảnh tối đa 5 MB. Vui lòng chọn ảnh nhỏ hơn.')).toBeInTheDocument()
  })

  it('translates a broken upload ("Unexpected end of form")', async () => {
    await ship(serverError('INVALID_IMAGE_UPLOAD', 'Unexpected end of form'))
    expect(await screen.findByText('Không tải được ảnh lên. Vui lòng chọn lại ảnh rồi thử lại.')).toBeInTheDocument()
  })

  it('keeps the messages the server already writes in Vietnamese', async () => {
    await ship(serverError('INVALID_IMAGE_UPLOAD', 'Vui lòng cung cấp ít nhất 1 ảnh chụp.'))
    expect(await screen.findByText('Vui lòng cung cấp ít nhất 1 ảnh chụp.')).toBeInTheDocument()
  })
})
