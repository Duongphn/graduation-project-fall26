import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '../../../test/render'
import { RentalPhotoPicker } from './rental-photo-picker'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d])

const renderPicker = () => {
  const onAddFiles = vi.fn()
  const { container } = renderWithProviders(
    <RentalPhotoPicker label="Ảnh lúc giao" photos={[]} rejections={[]} onAddFiles={onAddFiles} onRemove={vi.fn()} />,
  )
  const input = container.querySelector('input[type="file"]') as HTMLInputElement
  return { onAddFiles, input, user: userEvent.setup() }
}

// Review 20/11, rental bug 3: a .png that is not an image passed the picker and the server answered in English.
describe('RentalPhotoPicker', () => {
  it('drops a file whose content is not a real image and says so in Vietnamese', async () => {
    const { onAddFiles, input, user } = renderPicker()
    const fake = new File(['not really an image'], 'fake.png', { type: 'image/png' })
    const real = new File([PNG], 'real.png', { type: 'image/png' })
    await user.upload(input, [fake, real])
    expect(
      await screen.findByText('"fake.png" bị hỏng hoặc không phải ảnh JPG, PNG, WebP thật.'),
    ).toBeInTheDocument()
    await waitFor(() => expect(onAddFiles).toHaveBeenCalledWith([real]))
  })

  it('passes real images through without an error', async () => {
    const { onAddFiles, input, user } = renderPicker()
    const real = new File([PNG], 'real.png', { type: 'image/png' })
    await user.upload(input, real)
    await waitFor(() => expect(onAddFiles).toHaveBeenCalledWith([real]))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
