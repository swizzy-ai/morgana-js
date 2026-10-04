import { describe, expect, it } from 'vitest'
import { createEmptyIR } from '../ir'
import { accessModuleWarnings, emitAccessModule } from '../access'

function irWith(src?: string) {
  const ir = createEmptyIR()
  ir.channels.set('c', { name: 'c', scope: 'public', ...(src ? { __src: src } : {}) })
  return ir.channels
}

describe('the captured-function analyser', () => {
  it('says nothing about a self-contained check', () => {
    const c = irWith('(ctx) => Boolean(ctx.auth && ctx.auth.user)')
    expect(accessModuleWarnings(c)).toEqual([])
  })
  it('says nothing about a check that queries a store', () => {
    const c = irWith('async (ctx) => { const t = await ctx.server.collections.query("team", { filter: { id: ctx.auth.user.id } }); return { ok: t.total > 0 } }')
    expect(accessModuleWarnings(c)).toEqual([])
  })
  it('catches a closure over something the generated action cannot reach', () => {
    const c = irWith('(ctx) => ctx.auth.user.teamId === teamId')
    const w = accessModuleWarnings(c)
    expect(w).toHaveLength(1)
    expect(w[0]).toContain('teamId')
    expect(w[0]).toContain('channel "c"')
  })
  it('does not flag a local declaration or a destructured one', () => {
    const c = irWith('(ctx) => { const { user } = ctx.auth; return user ? true : false }')
    expect(accessModuleWarnings(c)).toEqual([])
  })
})

describe('the generated access action', () => {
  it('emits nothing when no channel declared a function', () => {
    expect(emitAccessModule(createEmptyIR().channels)).toBeNull()
  })
  it('dispatches on the channel in args and refuses an unknown one', () => {
    const ir = createEmptyIR()
    ir.channels.set('a', { name: 'a', scope: 'public', __src: '(ctx) => true' })
    ir.channels.set('b', { name: 'b', scope: 'public', __src: '(ctx) => false' })
    const mod = emitAccessModule(ir.channels)!
    expect(mod.name).toBe('__channel_access')
    expect(mod.code).toContain('"a": (ctx) => true')
    expect(mod.code).toContain('"b": (ctx) => false')
    // An unknown channel must not fall through to a permissive rule.
    expect(mod.code).toContain('hasOwnProperty')
  })
})
