import { describe, expect, it, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createObjectsRuntime, type ObjectTypeDef } from '../objects'

const DEFS: ObjectTypeDef[] = [
  {
    name: 'counter',
    shape: { columns: [{ name: 'count', type: 'number' }, { name: 'label', type: 'string' }] },
    links: {},
    computed: {},
    ops: ['get', 'bump'],
    opSrc: {
      get: 'async (ctx) => ({ count: ctx.object.state.count ?? 0 })',
      bump: 'async (ctx, p) => ({ count: (ctx.object.state.count ?? 0) + Number(p.by ?? 1) })',
    },
  },
]

const DESKTOP = {
  os: { platform: 'test', arch: 'test' },
  app: { name: 't', bundleId: 'com.t', version: '0', userDataPath: '/tmp', isPackaged: false },
} as unknown as { os: never; app: never }

let file: string

beforeEach(() => {
  file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'morgana-obj-')), 'objects.json')
})

describe('local object runtime', () => {
  it('creates with column defaults under props, and persists to disk', async () => {
    const objects = createObjectsRuntime({ defs: DEFS, file, desktop: DESKTOP })
    const inst = await objects.create('counter', { label: 'c1' })
    expect(inst.state).toMatchObject({ count: 0, label: 'c1' })
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))['counter:' + inst.id].state.count).toBe(0)
    const again = createObjectsRuntime({ defs: DEFS, file, desktop: DESKTOP })
    expect(await again.get('counter', inst.id)).toMatchObject({ id: inst.id })
  })

  it('run() returns the value and persists nothing by itself', async () => {
    const objects = createObjectsRuntime({ defs: DEFS, file, desktop: DESKTOP })
    const inst = await objects.create('counter', {})
    const out = await objects.run('counter', inst.id, 'bump', { by: 3 })
    expect(out).toEqual({ count: 3 })
    expect((await objects.get('counter', inst.id))?.state.count).toBe(0)
    await objects.set('counter', inst.id, out as Record<string, unknown>)
    expect((await objects.get('counter', inst.id))?.state.count).toBe(3)
  })

  it('an op can persist through ctx.object.set', async () => {
    const withSetter: ObjectTypeDef[] = [
      { ...DEFS[0]!, ops: ['save'], opSrc: { save: 'async (ctx, p) => ctx.object.set(p)' } },
    ]
    const objects = createObjectsRuntime({ defs: withSetter, file, desktop: DESKTOP })
    const inst = await objects.create('counter', {})
    await objects.run('counter', inst.id, 'save', { count: 9 })
    expect((await objects.get('counter', inst.id))?.state.count).toBe(9)
  })

  it('unknown type, op and instance fail with names', async () => {
    const objects = createObjectsRuntime({ defs: DEFS, file, desktop: DESKTOP })
    await expect(objects.create('nope', {})).rejects.toThrow('unknown object type "nope"')
    const inst = await objects.create('counter', {})
    await expect(objects.run('counter', inst.id, 'nope', {})).rejects.toThrow('no runnable source for op "nope"')
    await expect(objects.run('counter', 'missing', 'get', {})).rejects.toThrow('no "counter" instance "missing"')
    expect(await objects.remove('counter', 'missing')).toBe(false)
  })

  it('the missing server spine is a named error, not undefined', async () => {
    const withSpine: ObjectTypeDef[] = [
      { ...DEFS[0]!, ops: ['reach'], opSrc: { reach: 'async (ctx) => ctx.server.collections' } },
    ]
    const objects = createObjectsRuntime({ defs: withSpine, file, desktop: DESKTOP })
    const inst = await objects.create('counter', {})
    await expect(objects.run('counter', inst.id, 'reach', {})).rejects.toThrow('not available to object ops on desktop v1')
  })
})
