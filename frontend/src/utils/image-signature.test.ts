import { describe, expect, it } from 'vitest'

import { hasImageSignature } from './image-signature'

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10]
const WEBP = [0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]
const file = (bytes: number[] | string, name: string, type: string) =>
  new File([typeof bytes === 'string' ? bytes : new Uint8Array(bytes)], name, { type })

describe('hasImageSignature', () => {
  it('accepts real JPG, PNG and WebP files', async () => {
    expect(await hasImageSignature(file(PNG, 'a.png', 'image/png'))).toBe(true)
    expect(await hasImageSignature(file(JPEG, 'a.jpg', 'image/jpeg'))).toBe(true)
    expect(await hasImageSignature(file(WEBP, 'a.webp', 'image/webp'))).toBe(true)
  })

  it('rejects a text file renamed to .png and a PNG declared as JPG', async () => {
    expect(await hasImageSignature(file('not really an image', 'fake.png', 'image/png'))).toBe(false)
    expect(await hasImageSignature(file(PNG, 'a.jpg', 'image/jpeg'))).toBe(false)
    expect(await hasImageSignature(file([], 'empty.webp', 'image/webp'))).toBe(false)
  })

  it('leaves other types to the type check', async () => {
    expect(await hasImageSignature(file('%PDF', 'a.pdf', 'application/pdf'))).toBe(true)
  })
})
