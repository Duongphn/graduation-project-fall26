import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { palettes, type PaletteColor } from './palette'

// Drift check: src/index.css repeats palette.ts as --tf-* variables for Tailwind (:root = light,
// .dark = dark). Changing one without the other fails here. (Read from disk: with `css: false`
// a ?raw import of a stylesheet is empty.)
const css = readFileSync(join(__dirname, '..', 'index.css'), 'utf8')

const readVariables = (selector: string): Map<string, string> => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const block = new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(css)?.[1]
  if (block === undefined) throw new Error(`index.css has no "${selector}" block`)
  const variables = new Map<string, string>()
  for (const [, name, value] of block.matchAll(/(--tf-[\w-]+)\s*:\s*([^;]+);/g)) {
    variables.set(name, value.trim().toLowerCase())
  }
  return variables
}

// primaryHover -> --tf-primary-hover
const cssVariableOf = (key: string) =>
  `--tf-${key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}`

const paletteKeys = Object.keys(palettes.light) as PaletteColor[]

describe.each([
  [':root', 'light'],
  ['.dark', 'dark'],
] as const)('index.css %s', (selector, mode) => {
  const variables = readVariables(selector)
  const expected = new Map(
    paletteKeys.map((key) => [cssVariableOf(key), palettes[mode][key].toLowerCase()]),
  )

  it(`has every ${mode} palette colour as a --tf-* variable with the same value`, () => {
    expect(Object.fromEntries(variables)).toEqual(Object.fromEntries(expected))
  })

  it('has no --tf-* variable without a palette colour', () => {
    expect([...variables.keys()].filter((name) => !expected.has(name))).toEqual([])
  })
})

describe('Tailwind theme (@theme inline)', () => {
  it('maps every palette variable to a Tailwind colour', () => {
    const mapped = new Set([...css.matchAll(/var\((--tf-[\w-]+)\)/g)].map(([, name]) => name))
    expect(paletteKeys.map(cssVariableOf).filter((name) => !mapped.has(name))).toEqual([])
  })
})
