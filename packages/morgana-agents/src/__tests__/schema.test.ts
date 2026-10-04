import { describe, expect, it } from 'vitest'
import { checkArgs, paramsSchema } from '../schema'

describe('paramsSchema', () => {
  it('reads a bare string as the type', () => {
    expect(paramsSchema({ id: 'string', count: 'number' })).toEqual({
      type: 'object',
      properties: { id: { type: 'string' }, count: { type: 'number' } },
      required: ['id', 'count'],
    })
  })

  it('drops a trailing question mark from the name and from required', () => {
    const schema = paramsSchema({ 'note?': 'string' })
    expect(Object.keys(schema.properties)).toEqual(['note'])
    expect(schema.required).toBeUndefined()
  })

  it('lists only the non-optional names as required', () => {
    const schema = paramsSchema({ id: 'string', 'note?': 'string' })
    expect(schema.required).toEqual(['id'])
  })

  it('reads a describe and an enum off a parameter spec', () => {
    const schema = paramsSchema({
      status: { describe: 'Current status.', oneOf: ['open', 'closed'] },
    })
    expect(schema.properties.status).toEqual({
      type: 'string',
      description: 'Current status.',
      enum: ['open', 'closed'],
    })
  })

  it('treats a nested shape as an object', () => {
    const schema = paramsSchema({ filter: { term: 'string', limit: 'number' } })
    expect(schema.properties.filter.type).toBe('object')
  })

  it('leaves an unknown type word off the constraints', () => {
    // A project may invent a word. A weaker prompt beats a build failure.
    const schema = paramsSchema({ amount: 'money' })
    expect(schema.properties.amount).toEqual({ type: 'object' })
  })

  it('returns an empty shape for no parameters', () => {
    expect(paramsSchema({})).toEqual({ type: 'object', properties: {} })
  })
})

describe('checkArgs', () => {
  it('accepts anything when nothing is declared', () => {
    expect(checkArgs(undefined, { whatever: 1 })).toBeUndefined()
  })

  it('names the parameter when a required one is missing', () => {
    expect(checkArgs({ id: 'string' }, {})).toContain('"id" is required')
  })

  it('does not complain about a missing optional parameter', () => {
    expect(checkArgs({ 'id?': 'string' }, {})).toBeUndefined()
  })

  it('rejects a value of the wrong type', () => {
    expect(checkArgs({ id: 'string' }, { id: 41 })).toContain('must be a string')
  })

  it('accepts a number where an integer is declared', () => {
    expect(checkArgs({ n: 'int' }, { n: 4 })).toBeUndefined()
  })

  it('rejects a fractional number where an integer is declared', () => {
    expect(checkArgs({ n: 'int' }, { n: 4.5 })).toContain('must be a integer')
  })

  it('rejects a value outside the enum', () => {
    expect(checkArgs({ s: { oneOf: ['a', 'b'] } }, { s: 'c' })).toContain('must be one of')
  })

  it('accepts a value inside the enum', () => {
    expect(checkArgs({ s: { oneOf: ['a', 'b'] } }, { s: 'b' })).toBeUndefined()
  })

  it('checks a nested shape, and names the path', () => {
    // `filter.term`, not `term` — the action reads a nested object, so the model
    // has to be told which one was wrong.
    expect(checkArgs({ filter: { term: 'string' } }, { filter: {} })).toContain(
      '"filter.term" is required',
    )
  })

  it('accepts a nested shape that is correct', () => {
    expect(checkArgs({ filter: { term: 'string', limit: 'number' } }, { filter: { term: 'a', limit: 2 } }))
      .toBeUndefined()
  })

  it('ignores a parameter the shape never declared', () => {
    // The action may want it. The check only guards what the model was told.
    expect(checkArgs({ id: 'string' }, { id: 'x', extra: true })).toBeUndefined()
  })
})
