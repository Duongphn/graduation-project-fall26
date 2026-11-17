import { describe, expect, it } from 'vitest'

import { composeDonationDescription, donationDescriptionRoom, donationPostSchema } from './donation-post-schema'

// A complete donation post; each test changes one field.
const valid = {
  title: 'Bộ xe điều khiển địa hình',
  categoryId: '64b000000000000000000001',
  minAge: 3,
  maxAge: 6,
  condition: 'Như mới (90–99%)',
  description: 'x'.repeat(50),
  safety: { noSharpParts: true, batteriesRemoved: true, noSmallParts: true, cleaned: true },
  receiver: 'AUTO',
  handoverMethod: 'CARRIER' as const,
}

const descriptionErrors = (description: string) => {
  const result = donationPostSchema.safeParse({ ...valid, description })
  return result.success ? [] : result.error.issues.filter((issue) => issue.path[0] === 'description')
}

describe('donationPostSchema', () => {
  // R03 III.5.2.1 (1): the Toy Form rules apply, and III.3.1.1 (9) gives the description 50 to 1000
  // characters, the same minimum as the rent and sale listing form.
  it('asks for a description of at least 50 characters', () => {
    expect(descriptionErrors('x'.repeat(50))).toEqual([])
    expect(descriptionErrors(`  ${'x'.repeat(49)}  `).map((issue) => issue.message)).toEqual([
      'Mô tả tối thiểu 50 ký tự',
    ])
  })

  // R03 GB-11: no phone number, email address or http/www link in the name or the description.
  it('refuses contact details in the name or the description, not the weak hints', () => {
    const issues = (values: object) => {
      const result = donationPostSchema.safeParse({ ...valid, ...values })
      return result.success ? [] : result.error.issues.map((issue) => [issue.path[0], issue.message])
    }
    expect(issues({ title: 'Gấu bông, gọi 0912 345 678' })).toEqual([
      ['title', 'Không được ghi số điện thoại, email hoặc đường link trong tên đồ chơi.'],
    ])
    expect(issues({ description: `${'x'.repeat(50)} be.na@gmail.com` })).toEqual([
      ['description', 'Không được ghi số điện thoại, email hoặc đường link trong mô tả.'],
    ])
    expect(issues({ title: 'Gấu bông Momo', description: `${'x'.repeat(50)} Tobot.vn, TikTok` })).toEqual([])
  })

  // The server takes 1000 characters, the lines the form adds at the end included.
  it('leaves room for the handover and organization lines', () => {
    const name = 'T'.repeat(150)
    const room = donationDescriptionRoom('CARRIER', name)
    expect(composeDonationDescription('d'.repeat(room), 'CARRIER', name)).toHaveLength(1000)
    expect(donationDescriptionRoom('CARRIER', null)).toBeGreaterThan(800)
  })
})
