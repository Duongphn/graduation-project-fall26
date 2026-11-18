import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ImageGallery } from './ImageGallery'

// R05 TC-ACC-003: meaningful images have a text alternative (axe rule image-alt).
describe('ImageGallery text alternatives (TC-ACC-003)', () => {
  it('names every photo after what it shows', () => {
    render(<ImageGallery label="Tàu hoả gỗ" images={['https://example.com/a.png', 'https://example.com/b.png']} />)
    expect(screen.getByAltText('Tàu hoả gỗ – ảnh 1')).toBeInTheDocument()
    expect(screen.getByAltText('Tàu hoả gỗ – ảnh 2')).toBeInTheDocument()
  })

  it('never renders an image without alt', () => {
    const { container } = render(<ImageGallery images={[{ url: 'https://example.com/a.png', alt: 'Ảnh lúc giao' }, 'https://example.com/b.png']} />)
    const images = [...container.querySelectorAll('img')]
    expect(images.length).toBeGreaterThan(0)
    for (const img of images) expect(img.getAttribute('alt')).toBeTruthy()
    expect(screen.getByAltText('Ảnh lúc giao')).toBeInTheDocument()
  })
})
