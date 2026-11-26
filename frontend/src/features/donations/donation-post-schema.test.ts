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

  // The organization and the handover method are sent as their own fields (UC33 step 4), so the
  // Donor's description has the whole 1000 characters of the Toy Form.
  // R03 III.5.2.1 (8): the note to the organization is optional, at most 300 characters (trimmed).
  it('takes a note to the organization of up to 300 characters', () => {
    const noteErrors = (note: string | undefined) => {
      const result = donationPostSchema.safeParse({ ...valid, note })
      return result.success ? [] : result.error.issues.map((issue) => issue.message)
    }
    expect(noteErrors(undefined)).toEqual([])
    expect(noteErrors('')).toEqual([])
    expect(noteErrors(` ${'n'.repeat(300)} `)).toEqual([])
    expect(noteErrors('n'.repeat(301))).toEqual(['Ghi chú cho tổ chức tối đa 300 ký tự'])
  })

  it('takes a description of up to 1000 characters', () => {
    expect(descriptionErrors('d'.repeat(1000))).toEqual([])
    expect(descriptionErrors('d'.repeat(1001)).map((issue) => issue.message)).toEqual(['Mô tả tối đa 1000 ký tự'])
  })
})
