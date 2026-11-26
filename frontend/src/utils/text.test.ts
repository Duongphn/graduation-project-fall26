import { describe, expect, it } from 'vitest'

import { normalizeText as serverNormalizeText } from '../../../server/src/utils/text'
import { matchesWithoutTones, normalizeText, withoutTones } from './text'

// The category form decides "unchanged" and lengths with the server's normalisation, so both
// must agree. The first two cases are the server's own (server/tests/foundation/utils.test.ts).
const cases: Array<[string, string]> = [
  ['  Bé   Na ', 'Bé Na'],
  ['Hà noi', 'Hà noi'],
  ['Đồ\tchơi\n gỗ', 'Đồ chơi gỗ'],
  [' Xe đạp ', 'Xe đạp'],
  ['', ''],
  ['   ', ''],
]

describe('normalizeText', () => {
  it.each(cases)('normalizeText(%j) = %j', (input, expected) => {
    expect(normalizeText(input)).toBe(expected)
  })

  it.each(cases)('agrees with the server for %j', (input) => {
    expect(normalizeText(input)).toBe(serverNormalizeText(input))
  })
})

describe('withoutTones', () => {
  it('drops accents, đ, case and extra spaces', () => {
    expect(withoutTones('  Hồ   Chí Minh ')).toBe('ho chi minh')
    expect(withoutTones('Đà Nẵng')).toBe('da nang')
  })

  it('matches labels without accents', () => {
    expect(matchesWithoutTones('da nang', 'Thành phố Đà Nẵng')).toBe(true)
    expect(matchesWithoutTones('hue', 'Hà Nội')).toBe(false)
  })
})
