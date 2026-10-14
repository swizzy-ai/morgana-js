import { describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import {
  accessRefusal,
  callMethod,
  createInstance,
  destroyInstance,
  nextScheduledAt,
  readSnapshot,
  RUN_MEMBER_SRC,
  SELF_BUILDER_SRC,
  SerialQueue,
  takeDue,
  validateObjectMeta,
  type Invoke,
  type ObjectMeta,
  type ObjectSql,
} from '../server-host'

function sqliteAdapter(): ObjectSql {
  const db = new DatabaseSync(':memory:')
  return {
    exec: (sql, ...params) => {
      const st = db.prepare(sql)
      return /^\s*(SELECT|WITH)/i.test(sql) ? (st.all(...(params as never[])) as Array<Record<string, unknown>>) : (st.run(...(params as never[])), [])
    },
    transaction: (fn) => {
      db.exec('BEGIN')
      try {
        fn()
        db.exec('COMMIT')
      } catch (e) {
        db.exec('ROLLBACK')
        throw e
      }
    },
  }
}

const { __mgSelf, __mgRun } = new Function(`${SELF_BUILDER_SRC}\n${RUN_MEMBER_SRC}\nreturn { __mgSelf, __mgRun }`)() as {
  __mgSelf: (h: unknown, meta: unknown, ctx: unknown, kind: string) => unknown
  __mgRun: (def: unknown, kind: string, name: string, params: unknown, self: unknown) => Promise<{ result: unknown; computed: Record<string, unknown> }>
}

const def = {
  name: 'chat-room',
  state: { title: '', count: 0, open: true },
  collections: { messages: { columns: [{ name: 'text', type: 'string' }, { name: 'user', type: 'string' }] } },
  computed: { label: (s: { title: string; count: number }) => `${s.title} (${s.count})` },
  onCreate: async (self: any, init: { title?: string }) => {
    self.emit('created', { title: init.title })
  },
  methods: {
    post: async (self: any, p: { text: string }) => {
      const msg = self.db.messages.add({ text: p.text, user: self.caller?.id ?? 'anon' })
      self.set({ count: self.state.count + 1 })
      self.emit('message', msg)
      return msg
    },
    postTwiceThenFail: async (self: any) => {
      self.db.messages.add({ text: 'a' })
      self.set({ count: 999 })
      self.emit('message', { text: 'never' })
      throw new Error('boom')
    },
    seesOwnWrites: async (self: any) => {
      self.db.messages.add({ text: 'pending-1' })
      const r = self.db.messages.query({ where: { text: 'pending-1' } })
      return r.total
    },
    increment: async (self: any) => {
      const before = self.state.count
      await new Promise((r) => setTimeout(r, Math.random() * 3))
      self.set({ count: before + 1 })
      return before + 1
    },
    later: async (self: any) => {
      self.schedule('5m', 'post', { text: 'from the future' })
    },
    badField: async (self: any) => {
      self.db.messages.add({ text: 'x', colour: 'red' })
    },
  },
}

const meta: ObjectMeta = {
  name: 'chat-room',
  state: def.state,
  collections: def.collections,
  methods: Object.keys(def.methods),
  streams: [],
  jobs: [],
  computed: Object.keys(def.computed),
  access: { read: 'public', post: 'member', increment: { role: 'admin' } },
  hasOnCreate: true,
}

const invoke: Invoke = async ({ kind, name, params, host }) => {
  const self = __mgSelf(host, meta, {}, 'method')
  return __mgRun(def, kind, name, params, self)
}

describe('server object kernel', () => {
  it('creates by name with init merged over default state, onCreate events, computed stored', async () => {
    const sql = sqliteAdapter()
    const out = await createInstance(sql, meta, 'general', { title: 'General' }, null, invoke)
    expect(out.state).toEqual({ title: 'General', count: 0, open: true })
    expect(out.events).toEqual([{ event: 'created', data: { title: 'General' } }])
    expect(readSnapshot(sql, meta)).toEqual({ state: out.state, computed: { label: 'General (0)' } })
    await expect(createInstance(sql, meta, 'general', {}, null, invoke)).rejects.toMatchObject({ status: 409 })
  })

  it('a method commits state, rows and events together', async () => {
    const sql = sqliteAdapter()
    await createInstance(sql, meta, 'g', { title: 'G' }, null, invoke)
    const out = await callMethod(sql, meta, 'g', 'post', { text: 'hello' }, { id: 'u1', roles: [] }, invoke)
    expect((out.result as { text: string; user: string }).user).toBe('u1')
    expect(out.state.count).toBe(1)
    expect(out.computed).toEqual({ label: 'G (1)' })
    expect(out.events[0]!.event).toBe('message')
    expect(readSnapshot(sql, meta)!.state.count).toBe(1)
  })

  it('a throwing method changes nothing and releases no events', async () => {
    const sql = sqliteAdapter()
    await createInstance(sql, meta, 'g', { title: 'G' }, null, invoke)
    await expect(callMethod(sql, meta, 'g', 'postTwiceThenFail', {}, null, invoke)).rejects.toThrow('boom')
    expect(readSnapshot(sql, meta)!.state.count).toBe(0)
    const rows = await callMethod(sql, meta, 'g', 'seesOwnWrites', {}, null, invoke)
    expect(rows.result).toBe(1) // only its own pending row — the failed call left none
  })

  it('reads inside a call see the call’s own pending writes', async () => {
    const sql = sqliteAdapter()
    await createInstance(sql, meta, 'g', {}, null, invoke)
    expect((await callMethod(sql, meta, 'g', 'seesOwnWrites', {}, null, invoke)).result).toBe(1)
    expect((await callMethod(sql, meta, 'g', 'seesOwnWrites', {}, null, invoke)).result).toBe(2)
  })

  it('50 overlapping calls through the serial queue lose no update', async () => {
    const sql = sqliteAdapter()
    await createInstance(sql, meta, 'g', {}, null, invoke)
    const q = new SerialQueue()
    await Promise.all(Array.from({ length: 50 }, () => q.run('g', () => callMethod(sql, meta, 'g', 'increment', {}, null, invoke))))
    expect(readSnapshot(sql, meta)!.state.count).toBe(50)
  })

  it('schedules commit with the call and come due later', async () => {
    const sql = sqliteAdapter()
    await createInstance(sql, meta, 'g', {}, null, invoke)
    await callMethod(sql, meta, 'g', 'later', {}, null, invoke)
    const at = nextScheduledAt(sql)!
    expect(at).toBeGreaterThan(Date.now() + 4 * 60_000)
    expect(takeDue(sql)).toEqual([])
    expect(takeDue(sql, at + 1)).toEqual([{ method: 'post', params: { text: 'from the future' } }])
    expect(nextScheduledAt(sql)).toBeNull()
  })

  it('undeclared columns are refused, unknown methods 404, missing instance 404', async () => {
    const sql = sqliteAdapter()
    await expect(callMethod(sql, meta, 'nope', 'post', {}, null, invoke)).rejects.toMatchObject({ status: 404 })
    await createInstance(sql, meta, 'g', {}, null, invoke)
    await expect(callMethod(sql, meta, 'g', 'badField', {}, null, invoke)).rejects.toThrow(/colour/)
    await expect(callMethod(sql, meta, 'g', 'nope', {}, null, invoke)).rejects.toMatchObject({ status: 404 })
  })

  it('destroy removes everything', async () => {
    const sql = sqliteAdapter()
    await createInstance(sql, meta, 'g', {}, null, invoke)
    await callMethod(sql, meta, 'g', 'post', { text: 'x' }, null, invoke)
    expect(destroyInstance(sql, meta)).toBe(true)
    expect(readSnapshot(sql, meta)).toBeNull()
  })

  it('access: undeclared is server-only; public/member/role', () => {
    expect(accessRefusal(meta, 'read', null)).toBeNull()
    expect(accessRefusal(meta, 'post', null)).toBe(401)
    expect(accessRefusal(meta, 'post', { id: 'u', roles: [] })).toBeNull()
    expect(accessRefusal(meta, 'increment', { id: 'u', roles: [] })).toBe(403)
    expect(accessRefusal(meta, 'increment', { id: 'u', roles: ['admin'] })).toBeNull()
    expect(accessRefusal(meta, 'later', { id: 'u', roles: ['admin'] })).toBe(403)
  })

  it('validates definitions', () => {
    expect(validateObjectMeta(meta)).toEqual([])
    expect(validateObjectMeta({ ...meta, name: 'Bad Name' })[0]).toMatch(/lowercase/)
    expect(validateObjectMeta({ ...meta, access: { nope: 'public' } })[0]).toMatch(/not a method/)
    expect(validateObjectMeta({ ...meta, methods: [...meta.methods, 'create'] })[0]).toMatch(/reserved/)
  })
})
