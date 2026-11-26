import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Read from disk (Vitest runs in frontend/): it does not process CSS, so a ?raw import is empty.
const css = readFileSync(resolve(process.cwd(), 'src/features/toy-catalog/toy-search.css'), 'utf8')

/** The declarations of the first rule for `selector` outside any @media block. */
const baseRule = (selector: string) => {
  const body = css.split('@media')[0] ?? ''
  const start = body.indexOf(`${selector} {`)
  return start < 0 ? '' : body.slice(start, body.indexOf('}', start))
}

// E2E 26/11 #12: below 768 px the quick filter row (type tabs, age chips) made /toys 52 px wider
// than a 390 px screen. jsdom has no layout, so the rule itself is checked: its one column can
// shrink below its content and the chip rows scroll inside it.
describe('/toys quick filter row on a narrow screen', () => {
  it('uses a single column that can shrink (minmax(0, 1fr))', () => {
    expect(baseRule('.catalog-quick')).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/)
  })

  it('scrolls the type tabs and the age chips inside their row', () => {
    expect(baseRule('.type-switch')).toMatch(/max-width:\s*100%/)
    expect(baseRule('.type-switch')).toMatch(/overflow-x:\s*auto/)
    expect(baseRule('.age-chips')).toMatch(/min-width:\s*0/)
    expect(baseRule('.age-chips__list')).toMatch(/overflow-x:\s*auto/)
  })
})
