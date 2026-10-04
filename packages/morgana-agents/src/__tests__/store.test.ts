import { describe, expect, it } from 'vitest'
import { ProjectRegistries } from '../store'
import { memoryStore } from './memory-store'

const registries = () => new ProjectRegistries({ store: memoryStore(), prefix: 'agents:production:p1' })

describe('agent declarations', () => {
  it('persists a declaration so a second registry sees it', async () => {
    const store = memoryStore()
    const first = new ProjectRegistries({ store, prefix: 'agents:production:p1' })
    await first.createAgent('mary', { instruction: 'You manage tasks.' })

    // A different instance — a different Durable Object, a different request.
    const second = new ProjectRegistries({ store, prefix: 'agents:production:p1' })
    expect((await second.getAgent('mary'))?.instruction).toBe('You manage tasks.')
  })

  it('keeps the first declaration when create is called twice', async () => {
    const r = registries()
    await r.createAgent('mary', { instruction: 'first', description: 'the original' })
    await r.createAgent('mary', { instruction: 'second', description: 'the replacement' })

    const record = await r.getAgent('mary')
    expect(record?.instruction).toBe('first')
    expect(record?.description).toBe('the original')
  })

  it('changes a declaration through update', async () => {
    const r = registries()
    await r.createAgent('mary', { instruction: 'first' })
    await r.updateAgent('mary', { instruction: 'second' })
    expect((await r.getAgent('mary'))?.instruction).toBe('second')
  })

  it('refuses to update an agent that was never declared', async () => {
    await expect(registries().updateAgent('ghost', { instruction: 'x' })).rejects.toThrow(
      /has not been declared/,
    )
  })

  it('requires an instruction', async () => {
    await expect(registries().createAgent('mary', { instruction: '  ' })).rejects.toThrow(
      /requires an instruction/,
    )
  })

  it('requires a name', async () => {
    await expect(registries().createAgent('', { instruction: 'x' })).rejects.toThrow(/requires a name/)
  })

  it('lists agents in name order', async () => {
    const r = registries()
    await r.createAgent('zoe', { instruction: 'z' })
    await r.createAgent('amy', { instruction: 'a' })
    expect((await r.listAgents()).map((a) => a.name)).toEqual(['amy', 'zoe'])
  })

  it('forgets an agent and reports whether one was there', async () => {
    const r = registries()
    await r.createAgent('mary', { instruction: 'x' })
    expect(await r.removeAgent('mary')).toBe(true)
    expect(await r.removeAgent('mary')).toBe(false)
    expect(await r.getAgent('mary')).toBeUndefined()
  })
})

describe('tool declarations', () => {
  it('stores a description and a parameter shape', async () => {
    const r = registries()
    await r.registerTool('closeTask', {
      describe: 'Close a task with a reason.',
      params: { id: 'string', reason: 'string' },
    })
    const record = await r.getTool('closeTask')
    expect(record?.describe).toBe('Close a task with a reason.')
    expect(record?.params).toEqual({ id: 'string', reason: 'string' })
  })

  it('registers a tool with nothing but a name', async () => {
    const r = registries()
    const record = await r.registerTool('listTasks')
    expect(record.name).toBe('listTasks')
    expect(record.describe).toBeUndefined()
  })

  it('keeps the original createdAt across updates', async () => {
    let clock = 1000
    const r = new ProjectRegistries({
      store: memoryStore(),
      prefix: 'agents:production:p1',
      now: () => (clock += 10),
    })
    const first = await r.registerTool('listTasks', { describe: 'one' })
    const second = await r.registerTool('listTasks', { describe: 'two' })
    expect(second.createdAt).toBe(first.createdAt)
    expect(second.updatedAt).toBeGreaterThan(first.updatedAt)
    expect(second.describe).toBe('two')
  })

  it('prunes tools whose action is gone, and leaves the rest', async () => {
    const r = registries()
    await r.registerTool('listTasks')
    await r.registerTool('closeTask')
    await r.registerTool('ghostAction')

    const dropped = await r.pruneTools(async (name) => name !== 'ghostAction')

    expect(dropped).toEqual(['ghostAction'])
    expect((await r.listTools()).map((t) => t.name)).toEqual(['closeTask', 'listTasks'])
  })
})

describe('storage reads', () => {
  it('loads each registry once, then answers from cache', async () => {
    const store = memoryStore()
    const r = new ProjectRegistries({ store, prefix: 'agents:production:p1' })
    await r.createAgent('mary', { instruction: 'x' })

    const before = store.reads
    await r.listAgents()
    await r.listAgents()
    await r.getAgent('mary')
    expect(store.reads).toBe(before)
  })

  it('reads through after invalidate', async () => {
    const store = memoryStore()
    const r = new ProjectRegistries({ store, prefix: 'agents:production:p1' })
    await r.createAgent('mary', { instruction: 'x' })

    await store.put('agents:production:p1:john', {
      name: 'john',
      instruction: 'added elsewhere',
      createdAt: 1,
      updatedAt: 1,
    })
    expect(await r.getAgent('john')).toBeUndefined()

    r.invalidate()
    expect((await r.getAgent('john'))?.instruction).toBe('added elsewhere')
  })
})
