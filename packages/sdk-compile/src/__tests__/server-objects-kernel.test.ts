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
  matchTriggers,
  triggerPayload,
  parseObjectSelector,
  objectEventProblem,
  TRIGGER_JOB_PREFIX,
  type Invoke,
  type ObjectMeta,
  type ObjectSql,
  type ObjectTrigger,
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
    // Not 'created': the lifecycle names are announced by the object itself.
    self.emit('opened', { title: init.title })
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

/** An Invoke for an arbitrary definition/meta pair (each fixture needs its own). */
const invokeFor = (d: unknown, m: ObjectMeta): Invoke => async ({ kind, name, params, host }) => {
  const self = __mgSelf(host, m, {}, 'method')
  return __mgRun(d, kind, name, params, self)
}

describe('server object kernel', () => {
  it('creates by name with init merged over default state, onCreate events, computed stored', async () => {
    const sql = sqliteAdapter()
    const out = await createInstance(sql, meta, 'general', { title: 'General' }, null, invoke)
    expect(out.state).toEqual({ title: 'General', count: 0, open: true })
    expect(out.events).toEqual([{ event: 'opened', data: { title: 'General' } }])
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
    expect(out.events[0]!.event).toBe('messages.added')
    expect(out.events[1]!.event).toBe('message')
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

// ── `on` reactions: run inside the call that caused them, commit with it ──────

const reactDef = {
  name: 'reactor',
  state: { flagged: false, count: 0, unread: 0, purgeCount: 0, bumped: 0, lastText: '' },
  collections: { messages: { columns: [{ name: 'text', type: 'string' }] } },
  on: {
    'messages.added': (self: any) => self.set({ flagged: true, count: self.state.count + 1 }),
    'messages.updated': (self: any, row: any) => self.set({ lastText: row.text }),
    'messages.removed': (self: any) => self.set({ purgeCount: self.state.purgeCount + 1 }),
    'state.flagged': (self: any, change: any) => {
      if (change.value) self.set({ unread: self.state.unread + 1 })
    },
    ping: (self: any, data: any) => self.set({ bumped: self.state.bumped + data.n }),
  },
  methods: {
    add: async (self: any, p: { text: string }) => self.db.messages.add({ text: p.text }),
    putWithId: async (self: any, p: { id: string; text: string }) => self.db.messages.add({ id: p.id, text: p.text }),
    edit: async (self: any, p: { id: string; text: string }) => self.db.messages.update(p.id, { text: p.text }),
    drop: async (self: any, p: { id: string }) => self.db.messages.remove(p.id),
    ping: async (self: any) => self.emit('ping', { n: 2 }),
    emitDotted: async (self: any) => self.emit('a.b', {}),
    emitLifecycle: async (self: any) => self.emit('created', {}),
    emitPrivate: async (self: any) => self.emit('__x', {}),
  },
}

const reactMeta: ObjectMeta = {
  name: 'reactor',
  state: reactDef.state,
  collections: reactDef.collections,
  methods: Object.keys(reactDef.methods),
  streaming: [],
  jobs: [],
  computed: [],
  access: {},
  hasOnCreate: false,
  on: Object.keys(reactDef.on),
}
const invokeReact = invokeFor(reactDef, reactMeta)

describe('server object on reactions', () => {
  it('a record-write reaction runs with the call, and its own writes react too', async () => {
    const sql = sqliteAdapter()
    await createInstance(sql, reactMeta, 'r', {}, null, invokeReact)
    expect((readSnapshot(sql, reactMeta)!.state as Record<string, unknown>).count).toBe(0)

    const out = await callMethod(sql, reactMeta, 'r', 'add', { text: 'hi' }, null, invokeReact)
    // 'messages.added' set the flag in the same commit as the row; that set
    // queued 'state.flagged', which ran in a later round of the same call.
    expect(out.state).toMatchObject({ flagged: true, count: 1, unread: 1 })
    expect(readSnapshot(sql, reactMeta)!.state).toMatchObject({ count: 1, unread: 1 })
  })

  it('an update reaction sees the new row; a remove reaction sees the removed one', async () => {
    const sql = sqliteAdapter()
    await createInstance(sql, reactMeta, 'r', {}, null, invokeReact)
    const add = await callMethod(sql, reactMeta, 'r', 'add', { text: 'first' }, null, invokeReact)
    const id = (add.result as { id: string }).id

    await callMethod(sql, reactMeta, 'r', 'edit', { id, text: 'second' }, null, invokeReact)
    expect(readSnapshot(sql, reactMeta)!.state.lastText).toBe('second')

    const out = await callMethod(sql, reactMeta, 'r', 'drop', { id }, null, invokeReact)
    expect(out.state.purgeCount).toBe(1)
  })

  it('a custom event from self.emit reaches its reaction', async () => {
    const sql = sqliteAdapter()
    await createInstance(sql, reactMeta, 'r', {}, null, invokeReact)
    const out = await callMethod(sql, reactMeta, 'r', 'ping', {}, null, invokeReact)
    expect(out.state.bumped).toBe(2)
  })

  it('only writes that change state fire a state.<key> reaction', async () => {
    const sql = sqliteAdapter()
    await createInstance(sql, reactMeta, 'r', {}, null, invokeReact)
    // Two adds: 'messages.added' sets flagged the first time; the second set of
    // flagged=true is a no-op, so 'state.flagged' does not run again.
    await callMethod(sql, reactMeta, 'r', 'add', { text: 'one' }, null, invokeReact)
    const out = await callMethod(sql, reactMeta, 'r', 'add', { text: 'two' }, null, invokeReact)
    expect(out.state.count).toBe(2)
    expect(out.state.unread).toBe(1)
  })

  it('a caller-chosen id that already exists records an update, not an add', async () => {
    const sql = sqliteAdapter()
    await createInstance(sql, reactMeta, 'r', {}, null, invokeReact)
    const first = await callMethod(sql, reactMeta, 'r', 'putWithId', { id: 'm1', text: 'a' }, null, invokeReact)
    expect(first.events[0]!.event).toBe('messages.added')
    const second = await callMethod(sql, reactMeta, 'r', 'putWithId', { id: 'm1', text: 'b' }, null, invokeReact)
    expect(second.events[0]!.event).toBe('messages.updated')
    expect(second.state.lastText).toBe('b')
  })

  it('reactions that keep triggering each other fail the call at the loop guard', async () => {
    const loopDef = {
      name: 'looper',
      state: { n: 0 },
      collections: {},
      on: { 'state.n': (self: any) => self.set({ n: self.state.n + 1 }) },
      methods: { go: async (self: any) => self.set({ n: self.state.n + 1 }) },
    }
    const loopMeta: ObjectMeta = {
      name: 'looper',
      state: loopDef.state,
      collections: {},
      methods: Object.keys(loopDef.methods),
      streaming: [],
      jobs: [],
      computed: [],
      access: {},
      hasOnCreate: false,
      on: Object.keys(loopDef.on),
    }
    const invokeLoop = invokeFor(loopDef, loopMeta)
    const sql = sqliteAdapter()
    await createInstance(sql, loopMeta, 'l', {}, null, invokeLoop)
    await expect(callMethod(sql, loopMeta, 'l', 'go', {}, null, invokeLoop)).rejects.toThrow(/more than 8 rounds/)
    expect(readSnapshot(sql, loopMeta)!.state.n).toBe(0)
  })

  it('self.emit refuses dotted, lifecycle and private names', async () => {
    const sql = sqliteAdapter()
    await createInstance(sql, reactMeta, 'r', {}, null, invokeReact)
    await expect(callMethod(sql, reactMeta, 'r', 'emitDotted', {}, null, invokeReact)).rejects.toThrow(/without "\."/)
    await expect(callMethod(sql, reactMeta, 'r', 'emitLifecycle', {}, null, invokeReact)).rejects.toThrow(/announced by the object itself/)
    await expect(callMethod(sql, reactMeta, 'r', 'emitPrivate', {}, null, invokeReact)).rejects.toThrow(/not starting with "__"/)
  })
})

describe('server object on selectors are validated at build time', () => {
  it('accepts collection events, state paths and custom events', () => {
    expect(validateObjectMeta({ ...meta, on: ['messages.added', 'state.title', 'ping'] })).toEqual([])
    expect(validateObjectMeta({ ...meta, on: ['messages.added', 'messages.updated', 'messages.removed'] })).toEqual([])
  })

  it('rejects a state key the object does not have', () => {
    expect(validateObjectMeta({ ...meta, on: ['state.nope'] })[0]).toMatch(/is not in its state/)
  })

  it('rejects a lifecycle name — that is onCreate, or an action trigger', () => {
    expect(validateObjectMeta({ ...meta, on: ['created'] })[0]).toMatch(/announced by the object|onCreate/)
  })

  it('rejects a collection or verb that does not exist', () => {
    expect(validateObjectMeta({ ...meta, on: ['nope.added'] })[0]).toMatch(/no collection "nope"/)
    expect(validateObjectMeta({ ...meta, on: ['messages.shouted'] })[0]).toMatch(/messages.added, messages.updated or messages.removed/)
  })
})

// ── object triggers: `object:<type>[/<name>].<event>` delivery ────────────────

describe('object trigger selectors', () => {
  it('parses type, optional instance name, and event', () => {
    expect(parseObjectSelector('object:chat-room.messages.added')).toEqual({ type: 'chat-room', name: null, event: 'messages.added' })
    expect(parseObjectSelector('object:chat-room/lobby.messages.added')).toEqual({ type: 'chat-room', name: 'lobby', event: 'messages.added' })
    expect(parseObjectSelector('object:chat-room.created')).toEqual({ type: 'chat-room', name: null, event: 'created' })
    expect(parseObjectSelector('object:chat-room/lobby%201.x')).toEqual({ type: 'chat-room', name: 'lobby 1', event: 'x' })
  })

  it('is null for anything that is not that shape', () => {
    expect(parseObjectSelector('clicked')).toBeNull()
    expect(parseObjectSelector('object:Bad Name.x')).toBeNull()
    expect(parseObjectSelector('object:chat-room')).toBeNull()
  })

  it('checks an event against the type, leaving custom names to runtime', () => {
    expect(objectEventProblem(meta, 'created')).toBeNull()
    expect(objectEventProblem(meta, 'state')).toBeNull()
    expect(objectEventProblem(meta, 'ping')).toBeNull() // no dot: a self.emit name
    expect(objectEventProblem(meta, 'messages.added')).toBeNull()
    expect(objectEventProblem(meta, 'nope.added')).toMatch(/no collection "nope"/)
    expect(objectEventProblem(meta, 'messages.shouted')).toMatch(/collection event is/)
  })

  it('matchTriggers is scoped by type, event and (when given) instance name', () => {
    const triggers: ObjectTrigger[] = [
      { type: 'chat-room', name: null, event: 'messages.added', action: 'onMessage' },
      { type: 'chat-room', name: 'general', event: 'messages.added', action: 'onGeneralMessage' },
      { type: 'chat-room', name: null, event: 'created', action: 'onCreated' },
    ]
    expect(matchTriggers(triggers, 'chat-room', 'general', 'messages.added').map((t) => t.action)).toEqual(['onMessage', 'onGeneralMessage'])
    expect(matchTriggers(triggers, 'chat-room', 'other', 'messages.added').map((t) => t.action)).toEqual(['onMessage'])
    expect(matchTriggers(triggers, 'other-type', 'general', 'messages.added')).toEqual([])
    expect(matchTriggers(triggers, 'chat-room', 'general', 'removed')).toEqual([])
    expect(matchTriggers(triggers, 'chat-room', 'general', 'created').map((t) => t.action)).toEqual(['onCreated'])
  })

  it('triggerPayload is the ctx.args.event descriptor a triggered action gets', () => {
    const p = triggerPayload('chat-room', 'lobby', 'messages.added', { id: 'm1' })
    expect(p).toMatchObject({
      kind: 'object:chat-room.messages.added',
      source: 'chat-room',
      event: 'messages.added',
      object: { type: 'chat-room', instanceId: 'lobby', serverObject: true },
      payload: { id: 'm1' },
    })
    expect(typeof p.timestamp).toBe('string')
  })
})

describe('object triggers ride the durable queue', () => {
  // Two server actions on the type, one scoped to the 'general' instance.
  const triggers: ObjectTrigger[] = [
    { type: 'chat-room', name: null, event: 'messages.added', action: 'onMessage' },
    { type: 'chat-room', name: 'general', event: 'messages.added', action: 'onGeneralMessage' },
    { type: 'chat-room', name: 'general', event: 'created', action: 'onCreated' },
  ]

  it('creating an instance queues its "created" trigger, written with the commit', async () => {
    const sql = sqliteAdapter()
    const out = await createInstance(sql, meta, 'general', {}, null, invoke, { triggers })
    expect(out.triggers).toBe(1)
    const jobs = dueJobs(sql)
    expect(jobs).toHaveLength(1)
    expect(jobs[0]!.job).toBe(`${TRIGGER_JOB_PREFIX}onCreated`)
    expect(jobs[0]!.params.event).toMatchObject({ kind: 'object:chat-room.created', object: { instanceId: 'general' } })
  })

  it('an instance-scoped trigger does not fire for another instance', async () => {
    const sql = sqliteAdapter()
    const out = await createInstance(sql, meta, 'other', {}, null, invoke, { triggers })
    expect(out.triggers).toBe(0)
    expect(dueJobs(sql)).toEqual([])
  })

  it('a record write queues every matching trigger; a rollback queues none', async () => {
    const sql = sqliteAdapter()
    await createInstance(sql, meta, 'general', {}, null, invoke, { triggers })
    // The create already queued onCreated — clear it so the method is the only source.
    for (const j of dueJobs(sql)) finishJob(sql, j.id)

    const out = await callMethod(sql, meta, 'general', 'post', { text: 'hey' }, null, invoke, undefined, { triggers })
    expect(out.triggers).toBe(2)
    const actions = dueJobs(sql).map((j) => j.job).sort()
    expect(actions).toEqual([`${TRIGGER_JOB_PREFIX}onGeneralMessage`, `${TRIGGER_JOB_PREFIX}onMessage`])
    expect((dueJobs(sql)[0]!.params.event as { kind: string }).kind).toBe('object:chat-room.messages.added')

    // A method that throws mid-write commits nothing, so no trigger is queued.
    for (const j of dueJobs(sql)) finishJob(sql, j.id)
    await expect(callMethod(sql, meta, 'general', 'postTwiceThenFail', {}, null, invoke, undefined, { triggers })).rejects.toThrow('boom')
    expect(dueJobs(sql)).toEqual([])
  })

  it('a state change queues a "state" trigger when one is deployed', async () => {
    const stateTriggers: ObjectTrigger[] = [{ type: 'chat-room', name: null, event: 'state', action: 'onState' }]
    const sql = sqliteAdapter()
    await createInstance(sql, meta, 'g', {}, null, invoke, { triggers: stateTriggers })
    expect(dueJobs(sql)[0]!.params.event).toMatchObject({ kind: 'object:chat-room.state', payload: { title: '' } })
  })
})
