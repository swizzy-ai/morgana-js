import { describe, it, expect } from 'vitest'
import { EXAMPLES } from '../commands/example.mjs'
import { template } from '../templates.mjs'

describe('morgana example', () => {
  it('every listed example ships a complete guide', () => {
    for (const [name, entry] of Object.entries(EXAMPLES)) {
      const md = template(entry.file)
      expect(md, `${name}: has the rules section`).toContain('## Rules this example relies on')
      expect(md, `${name}: has no unfilled source marker`).not.toContain('<!-- SOURCE -->')
      expect((md.match(/^```/gm) ?? []).length % 2, `${name}: code fences are balanced`).toBe(0)
    }
  })
})
