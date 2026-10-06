import { describe, expect, it } from 'vitest'
import { customServerObject, type ServerObjectDefinition } from '../server-objects'
import { isValidCronExpression } from '../cron'

describe('customServerObject', () => {
  it('is an identity helper carrying the full def', () => {
    const def = {
      name: 'sheet',
      shape: { columns: [{ name: 'rows', type: 'json' }] },
      ops: {
        append: async (_ctx: unknown, p: Record<string, unknown>) => ({ ids: p }),
      },
    }
    expect(customServerObject(def)).toBe(def)
  })

  it('types ops against the server-object context', () => {
    const def: ServerObjectDefinition = customServerObject({
      name: 'sheet',
      ops: {
        query: async (ctx, p) => {
          expect(typeof ctx.object.get).toBe('function')
          expect(typeof ctx.actions.run).toBe('function')
          return { sheet: p['sheet'] ?? null }
        },
      },
    })
    expect(def.name).toBe('sheet')
    expect(Object.keys(def.ops ?? {})).toEqual(['query'])
  })
})

describe('isValidCronExpression', () => {
  it('accepts the grammar the worker tick evaluates', () => {
    expect(isValidCronExpression('* * * * *')).toBe(true)
    expect(isValidCronExpression('*/15 9-17 * * 1-5')).toBe(true)
    expect(isValidCronExpression('second-30')).toBe(true)
  })

  it('rejects garbage before it reaches KV', () => {
    expect(isValidCronExpression('soon')).toBe(false)
    expect(isValidCronExpression('* * *')).toBe(false)
    expect(isValidCronExpression('second-0')).toBe(false)
    expect(isValidCronExpression(42)).toBe(false)
    expect(isValidCronExpression('')).toBe(false)
  })
})
