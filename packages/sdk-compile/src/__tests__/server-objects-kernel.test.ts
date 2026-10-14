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
  dueJobs,
  claimJob,
  finishJob,
  failJob,
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
    // A streaming method: yields go to the caller as they happen; its writes
    // and its return value land when it finishes.
    answer: async function* (self: any, p: { words: string[] }) {
      const out: string[] = []
      for (const w of p.words) {
        out.push(w)
        yield w
      }
      self.db.messages.add({ text: out.join(' '), user: 'stream' })
      self.set({ count: self.state.count + 1 })
      return { saved: out.length }
    },
    summarizeLater: async (self: any) => {
      self.defer('summarize', { n: 1 })
    },
    deferThenFail: async (self: any) => {
      self.defer('summarize', { n: 2 })
      throw new Error('no')
    },
    answerThenFail: async function* (self: any) {
      self.set({ count: 500 })
      yield 'partial'
      throw new Error('source went away')
    },
  },
}

const meta: ObjectMeta = {
  name: 'chat-room',
  state: def.state,
  collections: def.collections,
  methods: Object.keys(def.methods),
  streaming: ['answer'],
  jobs: ['summarize'],
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

  it('deferred jobs are durable: written with the commit, retried, then dropped', async () => {
    const sql = sqliteAdapter()
    await createInstance(sql, meta, 'g', {}, null, invoke)
    await expect(callMethod(sql, meta, 'g', 'deferThenFail', {}, null, invoke)).rejects.toThrow('no')
    expect(dueJobs(sql)).toEqual([])
    const caller = { id: 'u1', email: 'a@b.c', roles: [] }
    const out = await callMethod(sql, meta, 'g', 'summarizeLater', {}, caller as never, invoke)
    expect(out.jobs.map((j) => j.job)).toEqual(['summarize'])
    const [job] = dueJobs(sql)
    expect(job).toMatchObject({ job: 'summarize', params: { n: 1 }, caller, attempts: 0 })
    expect(nextScheduledAt(sql)).toBeLessThanOrEqual(Date.now())
    claimJob(sql, job.id)
    expect(dueJobs(sql)).toEqual([])
    expect(failJob(sql, job.id)).toBe(false)
    expect(dueJobs(sql, Date.now() + 3000)[0]?.attempts).toBe(1)
    expect(failJob(sql, job.id)).toBe(false)
    expect(failJob(sql, job.id)).toBe(true)
    expect(dueJobs(sql, Date.now() + 1e9)).toEqual([])
    await callMethod(sql, meta, 'g', 'summarizeLater', {}, null, invoke)
    finishJob(sql, dueJobs(sql)[0].id)
    expect(nextScheduledAt(sql)).toBeNull()
  })

  it('undeclared columns are refused, unknown methods 404, missing instance 404', async () => {
    const sql = sqliteAdapter()
    await expect(callMethod(sql, meta, 'nope', 'post', {}, null, invoke)).rejects.toMatchObject({ status: 404 })
    await createInstance(sql, meta, 'g', {}, null, invoke)
    await expect(callMethod(sql, meta, 'g', 'badField', {}, null, invoke)).rejects.toThrow(/colour/)
    await expect(callMethod(sql, meta, 'g', 'nope', {}, null, invoke)).rejects.toMatchObject({ status: 404 })
  })

  it('a streaming method streams yields, then commits its writes and return value', async () => {
    const sql = sqliteAdapter()
    await createInstance(sql, meta, 'g', {}, null, invoke)
    const chunks: unknown[] = []
    const seenAtChunk: number[] = []
    const out = await callMethod(sql, meta, 'g', 'answer', { words: ['the', 'answer', 'is'] }, null, invoke, (c) => {
      chunks.push(c)
      seenAtChunk.push(readSnapshot(sql, meta)!.state.count as number)
    })
    expect(chunks).toEqual(['the', 'answer', 'is'])
    expect(seenAtChunk).toEqual([0, 0, 0]) // nothing committed while streaming
    expect(out.result).toEqual({ saved: 3 })
    expect(readSnapshot(sql, meta)!.state.count).toBe(1)
    const saved = await callMethod(sql, meta, 'g', 'seesOwnWrites', {}, null, invoke)
    expect(saved.result).toBe(1)
  })

  it('a streaming method that fails midway commits nothing', async () => {
    const sql = sqliteAdapter()
    await createInstance(sql, meta, 'g', {}, null, invoke)
    const chunks: unknown[] = []
    await expect(callMethod(sql, meta, 'g', 'answerThenFail', {}, null, invoke, (c) => void chunks.push(c))).rejects.toThrow('source went away')
    expect(chunks).toEqual(['partial'])
    expect(readSnapshot(sql, meta)!.state.count).toBe(0)
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
