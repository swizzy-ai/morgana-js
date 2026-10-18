import { describe, expect, it, vi } from 'vitest'
import { resolve, sideOf, steps, type Step } from '../steps'

/** A page with an input and a text, its state, and an action runner. */
function browserCtx(server?: (name: string, params: unknown) => unknown) {
  const objects: Record<string, any> = {
    'title-input': { value: 'Buy milk', props: {}, clear() { this.value = '' }, set(p: string, v: unknown) { this.props[p] = v }, get(p: string) { return this.props[p] } },
    banner: { props: { content: 'hi' }, set(p: string, v: unknown) { this.props[p] = v }, get(p: string) { return this.props[p] } },
  }
  const state: Record<string, unknown> = {}
  const navigated: string[] = []
  const ctx = {
    ui: {
      get: (id: string) => objects[id],
      pages: { navigate: (p: string) => navigated.push(p) },
      state: {
        get: (p: string) => state[p],
        set: (p: string, v: unknown) => { state[p] = v },
        append: (p: string, v: unknown) => { state[p] = [...((state[p] as unknown[]) ?? []), v] },
      },
    },
    actions: { run: vi.fn(async (name: string, params: unknown) => server?.(name, params)) },
  }
  return { ctx, objects, state, navigated }
}

/** Collections in memory. */
function serverCtx(args: Record<string, unknown> = {}) {
  const rows: Record<string, Array<Record<string, unknown>>> = { tasks: [] }
  let n = 0
  const collections = {
    insert: async (c: string, r: Record<string, unknown>) => { const row = { ...r, id: `r${++n}` }; rows[c].push(row); return row },
    update: async (c: string, id: string, d: Record<string, unknown>) => { const i = rows[c].findIndex((r) => r.id === id); rows[c][i] = { ...rows[c][i], ...d }; return rows[c][i] },
    remove: async (c: string, id: string) => { rows[c] = rows[c].filter((r) => r.id !== id); return true },
    find: async (c: string) => rows[c],
  }
  return { ctx: { args, server: { collections } }, rows }
}

describe('steps in the browser', () => {
  it('runs in order, sharing what each step found', async () => {
    const { ctx, objects, state, navigated } = browserCtx()
    const result = await steps([
      { do: 'read', from: 'title-input', as: 'title' },
      { do: 'set', object: 'banner', to: '$title' },
      { do: 'state.add', path: 'count', by: 2 },
      { do: 'state.push', path: 'titles', item: '$title' },
      { do: 'clear', object: 'title-input' },
      { do: 'go', page: 'tasks' },
    ])(ctx)
    expect(result.ok).toBe(true)
    expect(objects.banner.props.content).toBe('Buy milk')
    expect(objects['title-input'].value).toBe('')
    expect(state).toEqual({ count: 2, titles: ['Buy milk'] })
    expect(navigated).toEqual(['tasks'])
  })

  it('sends what the server needs and keeps its answer', async () => {
    const { ctx, objects } = browserCtx((name, params) => ({ name, ...(params as object), id: 'r1' }))
    await steps([
      { do: 'read', from: 'title-input', as: 'title' },
      { do: 'server', action: 'saveTask', send: ['title'], as: 'record' },
      { do: 'set', object: 'banner', to: '$record.id' },
    ])(ctx)
    expect(ctx.actions.run).toHaveBeenCalledWith('saveTask', { title: 'Buy milk' })
    expect(objects.banner.props.content).toBe('r1')
  })

  it('stops at the first failure and says which step and why', async () => {
    const { ctx, navigated } = browserCtx()
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const result = await steps([{ do: 'read', from: 'nope', as: 'x' }, { do: 'go', page: 'tasks' }])(ctx)
    expect(result).toEqual({ ok: false, error: 'step 1 (read nope): nothing on this page has the id "nope"' })
    expect(navigated).toEqual([])
    err.mockRestore()
  })

  it('runs otherwise instead, with the message in $error', async () => {
    const { ctx, state } = browserCtx()
    await steps([{ do: 'set', object: 'banner', to: '$missing' }], { otherwise: [{ do: 'state.set', path: 'problem', to: '$error' }] })(ctx)
    expect(state.problem).toBe('step 1 (set banner): nothing called "missing" yet')
  })

  it('refuses data steps in the browser, saying where they belong', async () => {
    const { ctx } = browserCtx()
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const result = await steps([{ do: 'add', collection: 'tasks', values: {} }])(ctx)
    expect(result.error).toMatch(/runs on the server — put it in steps.server/)
    err.mockRestore()
  })
})

describe('steps on the server', () => {
  it('creates a draft, saves it, and returns the stored record', async () => {
    const { ctx, rows } = serverCtx({ title: 'Buy milk' })
    const out = await steps.server([
      { do: 'create', collection: 'tasks', values: { title: '$title', done: false }, as: 'record' },
      { do: 'save', record: '$record' },
      { do: 'return', value: '$record' },
    ])(ctx)
    expect(out).toEqual({ title: 'Buy milk', done: false, id: 'r1' })
    expect(rows.tasks).toHaveLength(1)
  })

  it('saving a stored record updates it', async () => {
    const { ctx, rows } = serverCtx()
    await steps.server([
      { do: 'add', collection: 'tasks', values: { title: 'a', done: false }, as: 'task' },
      { do: 'save', record: { id: '$task.id', title: 'a', done: true }, collection: 'tasks' },
    ])(ctx)
    expect(rows.tasks).toEqual([{ title: 'a', done: true, id: 'r1' }])
  })

  it('finds, updates and deletes by fields', async () => {
    const { ctx, rows } = serverCtx()
    const out = await steps.server([
      { do: 'add', collection: 'tasks', values: { title: 'a', done: false } },
      { do: 'add', collection: 'tasks', values: { title: 'b', done: false } },
      { do: 'update', collection: 'tasks', where: { title: 'a' }, values: { done: true } },
      { do: 'delete', collection: 'tasks', where: { title: 'b' } },
      { do: 'find', collection: 'tasks', where: { done: true }, as: 'finished' },
      { do: 'return', value: '$finished' },
    ])(ctx)
    expect(out).toEqual([{ title: 'a', done: true, id: 'r1' }])
    expect(rows.tasks).toHaveLength(1)
  })

  it('a failure on the server throws, so the browser step that called it fails', async () => {
    const { ctx } = serverCtx()
    await expect(steps.server([{ do: 'save', record: '$nothing' }])(ctx)).rejects.toThrow('step 1 (save the record): nothing called "nothing" yet')
  })

  it('refuses page steps on the server', async () => {
    const { ctx } = serverCtx()
    await expect(steps.server([{ do: 'go', page: 'x' }])(ctx)).rejects.toThrow('this step changes the page, so it runs in the browser')
  })
})

describe('the pieces', () => {
  it('knows which side each step runs on', () => {
    const sides = (['read', 'create', 'server', 'go', 'save', 'log'] as Step['do'][]).map((d) => sideOf({ do: d } as Step))
    expect(sides).toEqual(['browser', 'server', 'either', 'browser', 'server', 'either'])
  })

  it('resolves references inside objects, and $$ is a literal dollar', () => {
    expect(resolve({ a: '$x.y', b: ['$x.y', '$$5'] }, { x: { y: 1 } })).toEqual({ a: 1, b: [1, '$5'] })
  })
})
