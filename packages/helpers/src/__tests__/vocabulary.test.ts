import { describe, expect, it } from 'vitest'
import { generate } from '../../scripts/vocabulary-core.mjs'
import vocabulary from '../../vocabulary.json'

describe('vocabulary.json', () => {
  it('matches the make and set methods (regenerate with node scripts/vocabulary.mjs)', () => {
    expect(JSON.parse(generate())).toEqual(vocabulary)
  }, 60_000)   // builds a TypeScript program over make.ts and set.ts
  it('says what each word takes', () => {
    expect(vocabulary.make.padding.params[0]).toMatchObject({ takes: 'words', amount: 'distance' })
    expect(vocabulary.make.background.params[0]).toMatchObject({ takes: 'colour' })
    expect(vocabulary.make.textColor.say).toContain('text colour')
    expect(vocabulary.make.bold.params).toEqual([])
    expect(vocabulary.set.placeholder.params[0]).toMatchObject({ takes: 'text' })
  })
})
