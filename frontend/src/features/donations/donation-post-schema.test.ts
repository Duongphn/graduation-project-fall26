import { describe, expect, it } from 'vitest'

import { donationPostSchema } from './donation-post-schema'

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
})
