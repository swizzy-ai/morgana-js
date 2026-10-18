// Sequences: several steps, one Morgana action.
//
//   export const onSave = defineClientAction({
//     config: { on: 'save.clicked' },
//     handler: steps([
//       { do: 'read', from: 'title-input', as: 'title' },
//       { do: 'server', action: 'onSaveServer', send: ['title'], as: 'record' },
//       { do: 'clear', object: 'title-input' },
//       { do: 'go', page: 'tasks' },
//     ]),
//   })
//
//   export const onSaveServer = defineServerAction({
//     handler: steps.server([
//       { do: 'create', collection: 'tasks', values: { title: '$title', done: false }, as: 'record' },
//       { do: 'save', record: '$record' },
//       { do: 'return', value: '$record' },
//     ]),
//   })
//
// Steps run in order and share a scope: a step's result is named with `as`,
// and later steps read it as `$name` (or `$name.field`). The first step that
// fails stops the sequence with a message that says which step and why; an
// `otherwise` list runs instead, with the message in `$error`.
//
// Some steps belong to the browser (the page, the state, navigation) and some
// to the server (collections). Browser code is public, so data is only ever
// touched by `steps.server`, inside a server action the browser calls.

export type Value = unknown

export type Step =
  // the page (browser)
  | { do: 'read'; from: string; prop?: string; as: string }
  | { do: 'set'; object: string; prop?: string; to: Value }
  | { do: 'clear'; object: string }
  | { do: 'show'; object: string }
  | { do: 'hide'; object: string }
  | { do: 'go'; page: string }
  | { do: 'message'; text: Value }
  // the page's state (browser)
  | { do: 'state.set'; path: string; to: Value }
  | { do: 'state.add'; path: string; by?: Value }
  | { do: 'state.push'; path: string; item: Value }
  // data (server)
  | { do: 'create'; collection: string; values: Record<string, Value>; as?: string }
  | { do: 'save'; record: Value; collection?: string; as?: string }
  | { do: 'add'; collection: string; values: Record<string, Value>; as?: string }
  | { do: 'update'; collection: string; where: Record<string, Value>; values: Record<string, Value>; as?: string }
  | { do: 'delete'; collection: string; where: Record<string, Value> }
  | { do: 'find'; collection: string; where?: Record<string, Value>; as: string }
  | { do: 'return'; value: Value }
  // either side
  | { do: 'server'; action: string; send?: string[]; as?: string }
  | { do: 'call'; action: string; with?: Record<string, Value>; as?: string }
  | { do: 'wait'; ms: number }
  | { do: 'log'; text: Value }

export interface StepsOptions {
  /** Runs instead of the rest when a step fails; the message is `$error`. */
  otherwise?: Step[]
}

export interface StepsResult {
  ok: boolean
  error?: string
  /** What the sequence returned (`return`), or its scope. */
  value?: unknown
}

const BROWSER = new Set(['read', 'set', 'clear', 'show', 'hide', 'go', 'message', 'state.set', 'state.add', 'state.push'])
const SERVER = new Set(['create', 'save', 'add', 'update', 'delete', 'find', 'return'])

/** Which side a step runs on: 'browser', 'server' or 'either'. */
export function sideOf(step: Step): 'browser' | 'server' | 'either' {
  return BROWSER.has(step.do) ? 'browser' : SERVER.has(step.do) ? 'server' : 'either'
}

type Scope = Record<string, unknown>
const DRAFT = Symbol('collection')

/** `$name`, `$name.field` → the value in scope; `$$` escapes a literal `$`. Objects and arrays resolve inside. */
export function resolve(value: Value, scope: Scope): unknown {
  if (typeof value === 'string') {
    if (value.startsWith('$$')) return value.slice(1)
    if (value.startsWith('$')) {
      const [name, ...path] = value.slice(1).split('.')
      if (!(name in scope)) throw new Error(`nothing called "${name}" yet`)
      let cur: unknown = scope[name]
      for (const p of path) cur = cur == null ? undefined : (cur as Record<string, unknown>)[p]
      return cur
    }
    return value
  }
  if (Array.isArray(value)) return value.map((v) => resolve(v, scope))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, resolve(v, scope)]))
  }
  return value
}

/** A step in words, for error messages. */
function describe(step: Step): string {
  switch (step.do) {
    case 'read': return `read ${step.from}`
    case 'set': return `set ${step.object}${step.prop ? ` ${step.prop}` : ''}`
    case 'clear': case 'show': case 'hide': return `${step.do} ${step.object}`
    case 'go': return `go to ${step.page}`
    case 'state.set': case 'state.add': case 'state.push': return `${step.do.slice(6)} ${step.path}`
    case 'create': case 'add': case 'update': case 'delete': case 'find': return `${step.do} in ${step.collection}`
    case 'save': return 'save the record'
    case 'server': case 'call': return `${step.do} ${step.action}`
    default: return step.do
  }
}

/** The page side of a ctx, loosely: the runner only calls what a step needs. */
interface AnyCtx {
  ui?: any
  actions?: { run(name: string, params?: unknown): Promise<unknown> }
  server?: { collections: any }
  args?: unknown
  log?: { info?(...a: unknown[]): void }
}

function handleOf(ctx: AnyCtx, id: string): any {
  const h = ctx.ui?.get?.(id)
  if (!h) throw new Error(`nothing on this page has the id "${id}"`)
  return h
}

const matches = (row: Record<string, unknown>, where: Record<string, unknown>) =>
  Object.entries(where).every(([k, v]) => row[k] === v)

async function runOne(step: Step, ctx: AnyCtx, scope: Scope, side: 'browser' | 'server'): Promise<{ returned?: unknown } | void> {
  const s = sideOf(step)
  if (s !== 'either' && s !== side) {
    throw new Error(side === 'browser'
      ? 'this step works with data, so it runs on the server — put it in steps.server and call that with a "server" step'
      : 'this step changes the page, so it runs in the browser')
  }
  const store = (as: string | undefined, v: unknown) => { if (as) scope[as] = v }
  const cols = () => {
    if (!ctx.server?.collections) throw new Error('no collections here')
    return ctx.server.collections
  }

  switch (step.do) {
    case 'read': {
      const h = handleOf(ctx, step.from)
      // Inputs report what was typed; anything else, its prop.
      const v = step.prop ? h.get(step.prop) : 'value' in h ? h.value : h.get('value') ?? h.get('content')
      store(step.as, v)
      return
    }
    case 'set': {
      const h = handleOf(ctx, step.object)
      const v = resolve(step.to, scope)
      if (!step.prop || step.prop === 'value') { if ('value' in h) { h.value = v; return } }
      h.set(step.prop ?? 'content', v)
      return
    }
    case 'clear': {
      const h = handleOf(ctx, step.object)
      if (typeof h.clear === 'function') h.clear()
      else h.set('value', '')
      return
    }
    case 'show': handleOf(ctx, step.object).set('hidden', false); return
    case 'hide': handleOf(ctx, step.object).set('hidden', true); return
    case 'go': ctx.ui.pages.navigate(step.page); return
    case 'message': {
      const text = resolve(step.text, scope)
      ctx.ui.state.set('message', text)
      return
    }
    case 'state.set': ctx.ui.state.set(step.path, resolve(step.to, scope)); return
    case 'state.add': ctx.ui.state.set(step.path, Number(ctx.ui.state.get(step.path) ?? 0) + Number(resolve(step.by ?? 1, scope))); return
    case 'state.push': ctx.ui.state.append(step.path, resolve(step.item, scope)); return

    case 'create': {
      // A draft, kept in the scope until `save`.
      const draft = { ...(resolve(step.values, scope) as Record<string, unknown>) }
      Object.defineProperty(draft, DRAFT, { value: step.collection, enumerable: false })
      store(step.as ?? 'record', draft)
      return
    }
    case 'save': {
      const rec = resolve(step.record, scope) as Record<string | symbol, unknown> | null
      if (!rec || typeof rec !== 'object') throw new Error('there is no record to save')
      const collection = step.collection ?? (rec[DRAFT] as string | undefined)
      if (!collection) throw new Error('which collection? say "save it in <collection>"')
      const data = { ...rec } as Record<string, unknown>
      const saved = typeof data.id === 'string'
        ? await cols().update(collection, data.id, data)
        : await cols().insert(collection, data)
      // `save $record` with no `as` keeps the name, now pointing at the stored record.
      const name = step.as ?? (typeof step.record === 'string' && step.record.startsWith('$') ? step.record.slice(1).split('.')[0] : undefined)
      store(name, saved)
      return
    }
    case 'add': store(step.as, await cols().insert(step.collection, resolve(step.values, scope) as Record<string, unknown>)); return
    case 'update': {
      const where = resolve(step.where, scope) as Record<string, unknown>
      const values = resolve(step.values, scope) as Record<string, unknown>
      const rows = (await cols().find(step.collection)) as Array<Record<string, unknown>>
      const updated = []
      for (const row of rows.filter((r) => matches(r, where))) updated.push(await cols().update(step.collection, String(row.id), values))
      store(step.as, updated)
      return
    }
    case 'delete': {
      const where = resolve(step.where, scope) as Record<string, unknown>
      const rows = (await cols().find(step.collection)) as Array<Record<string, unknown>>
      for (const row of rows.filter((r) => matches(r, where))) await cols().remove(step.collection, String(row.id))
      return
    }
    case 'find': {
      const where = step.where ? (resolve(step.where, scope) as Record<string, unknown>) : null
      const rows = (await cols().find(step.collection)) as Array<Record<string, unknown>>
      store(step.as, where ? rows.filter((r) => matches(r, where)) : rows)
      return
    }
    case 'return': return { returned: resolve(step.value, scope) }

    case 'server': {
      if (!ctx.actions) throw new Error('no actions here')
      const params = Object.fromEntries((step.send ?? []).map((n) => [n, resolve(`$${n}`, scope)]))
      store(step.as, await ctx.actions.run(step.action, params))
      return
    }
    case 'call': {
      if (!ctx.actions) throw new Error('no actions here')
      store(step.as, await ctx.actions.run(step.action, step.with ? resolve(step.with, scope) : {}))
      return
    }
    case 'wait': await new Promise((r) => setTimeout(r, step.ms)); return
    case 'log': console.log(resolve(step.text, scope)); return
  }
}

async function run(list: Step[], ctx: AnyCtx, side: 'browser' | 'server', opts: StepsOptions, scope: Scope): Promise<StepsResult> {
  for (let i = 0; i < list.length; i++) {
    let out: { returned?: unknown } | void
    try {
      out = await runOne(list[i], ctx, scope, side)
    } catch (err) {
      const message = `step ${i + 1} (${describe(list[i])}): ${err instanceof Error ? err.message : String(err)}`
      if (opts.otherwise?.length) {
        scope.error = message
        await run(opts.otherwise, ctx, side, {}, scope)
        return { ok: false, error: message }
      }
      if (side === 'server') throw new Error(message)
      console.error(`[steps] ${message}`)
      return { ok: false, error: message }
    }
    if (out && 'returned' in out) return { ok: true, value: out.returned }
  }
  return { ok: true, value: scope }
}

/** A browser action's handler that runs the steps in order. */
export function steps(list: Step[], opts: StepsOptions = {}) {
  return async (ctx: unknown): Promise<StepsResult> => run(list, ctx as AnyCtx, 'browser', opts, {})
}

/**
 * A server action's handler that runs the steps in order. What the browser
 * sent (the `send` of its `server` step) starts in scope; `return` is the
 * answer, otherwise there is none.
 */
steps.server = function server(list: Step[], opts: StepsOptions = {}) {
  return async (ctx: unknown): Promise<unknown> => {
    const c = ctx as AnyCtx
    const sent = c.args && typeof c.args === 'object' ? { ...(c.args as Scope) } : {}
    const result = await run(list, c, 'server', opts, sent)
    return result.value === sent ? undefined : result.value
  }
}
