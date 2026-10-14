/**
 * Local object runtime — `ctx.desktop.objects` on the desktop lane.
 *
 * Instances persist to a JSON file beside the app data (one file, keyed
 * `type:id`) — deliberately NOT the host's SQLite store. The host owns
 * collections; objects are a separate domain with free-form state, and
 * sharing the store would couple their schemas, migrations and locking for
 * no reason. A second file the app owns outright is simpler and survives the
 * host being swapped.
 *
 * Op semantics, stated once: `run()` returns the op's return value and
 * persists nothing by itself. State changes only through
 * `ctx.object.set()` inside the op or `set()` outside it. A computed
 * value nobody stores is just a value — silently writing it back would make
 * every read a write.
 *
 * Op ctx on v1 is args/params/object/desktop/log/vars. There is no
 * ctx.server behind it, so `server`/`ai`/`actions` are throwing proxies
 * with a named error rather than undefined — an op reaching for the cloud
 * spine learns which lane it belongs in instead of TypeErroring on void.
 */

import fs from 'node:fs'
import path from 'node:path'
import type {
  DesktopAppInfo,
  DesktopObjectInstance,
  DesktopObjectsHandle,
  DesktopObjectTypeDef,
  DesktopOsHandle,
} from '@studiomorgana/sdk'

/** One entry of dist/objects.json as the desktop host reads it. */
export interface ObjectTypeDef {
  name: string
  shape?: unknown
  links?: unknown
  computed?: unknown
  ops: string[]
  opSrc: Record<string, string>
}

export interface ObjectsRuntimeDeps {
  defs?: ObjectTypeDef[]
  /** Instance persistence file, e.g. <userData>/objects.json. */
  file: string
  vars?: Record<string, unknown>
  desktop: { os: DesktopOsHandle; app: DesktopAppInfo }
}

type InstanceDb = Record<string, { id: string; type: string; state: Record<string, unknown> }>

function readDb(file: string): InstanceDb {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as InstanceDb
    return {}
  } catch {
    return {}
  }
}

function writeDb(file: string, db: InstanceDb): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(db, null, 2), 'utf8')
}

const uid = (type: string): string => type + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)

/** Column defaults so a created instance is complete before props land. */
function defaultsFor(shape: unknown): Record<string, unknown> {
  const columns = (shape as { columns?: Array<{ name: string; type: string }> } | undefined)?.columns
  if (!Array.isArray(columns)) return {}
  const out: Record<string, unknown> = {}
  for (const c of columns) {
    if (!c || typeof c.name !== 'string') continue
    out[c.name] = c.type === 'number' ? 0 : c.type === 'boolean' ? false : ''
  }
  return out
}

function throwingSpine(group: 'server' | 'ai' | 'actions'): unknown {
  return new Proxy(
    {},
    {
      get: (_t, key) => {
        throw new Error(
          'ctx.' + group + '.' + String(key) + ' is not available to object ops on desktop v1' + ' — this op needs the cloud lane, or the op must stay state-local',
        )
      },
    },
  )
}

export function createObjectsRuntime(deps: ObjectsRuntimeDeps): DesktopObjectsHandle {
  const { file, vars = {}, desktop } = deps
  const types = new Map((deps.defs ?? []).map((d) => [d.name, d]))
  const compiled = new Map<string, (ctx: unknown, params: unknown) => unknown>()

  const defOf = (type: string): ObjectTypeDef => {
    const def = types.get(type)
    if (!def) {
      throw new Error('unknown object type "' + type + '" — known types: ' + ([...types.keys()].join(', ') || '(none)'))
    }
    return def
  }

  const compileOp = (type: string, op: string): ((ctx: unknown, params: unknown) => unknown) => {
    const key = type + ' :: ' + op
    const hit = compiled.get(key)
    if (hit) return hit
    const def = defOf(type)
    const src = def.opSrc?.[op]
    if (typeof src !== 'string' || !src) {
      throw new Error(
        'object "' + type + '" has no runnable source for op "' + op + '"' + ' — the op is declared but its body did not ship (see the build warning)',
      )
    }
    let fn: unknown
    try {
      fn = new Function('return (' + src + ')')() as unknown
    } catch (err) {
      throw new Error('object "' + type + '" op "' + op + '" does not compile: ' + (err instanceof Error ? err.message : String(err)))
    }
    if (typeof fn !== 'function') {
      throw new Error('object "' + type + '" op "' + op + '" is not a function once compiled')
    }
    const typed = fn as (ctx: unknown, params: unknown) => unknown
    compiled.set(key, typed)
    return typed
  }

  const api: DesktopObjectsHandle = {
    types: async (): Promise<DesktopObjectTypeDef[]> =>
      [...types.values()].map((d) => ({ name: d.name, shape: d.shape, ops: d.ops })),

    type: async (name: string): Promise<DesktopObjectTypeDef | null> => {
      const d = types.get(name)
      return d ? { name: d.name, shape: d.shape, ops: d.ops } : null
    },

    create: async (type: string, props = {}): Promise<DesktopObjectInstance> => {
      const def = defOf(type)
      const db = readDb(file)
      const id = uid(type)
      const state = { ...defaultsFor(def.shape), ...(props ?? {}) }
      db[type + ':' + id] = { id, type, state }
      writeDb(file, db)
      return { id, type, state: { ...state } }
    },

    get: async (type: string, id: string): Promise<DesktopObjectInstance | null> => {
      defOf(type)
      const rec = readDb(file)[type + ':' + id]
      return rec ? { id: rec.id, type: rec.type, state: { ...rec.state } } : null
    },

    run: async (type: string, id: string, op: string, params = {}): Promise<unknown> => {
      defOf(type)
      const key = type + ':' + id
      const rec = readDb(file)[key]
      if (!rec) throw new Error('no "' + type + '" instance "' + id + '"')
      const fn = compileOp(type, op)
      const opCtx = {
        args: params,
        params,
        object: {
          type,
          name: type,
          instanceId: id,
          state: { ...rec.state },
          get: async (): Promise<Record<string, unknown>> => ({ ...(readDb(file)[key]?.state ?? {}) }),
          set: async (patch: Record<string, unknown>): Promise<Record<string, unknown>> => {
            const db = readDb(file)
            const cur = db[key]
            if (!cur) throw new Error('no "' + type + '" instance "' + id + '"')
            cur.state = { ...cur.state, ...(patch ?? {}) }
            writeDb(file, db)
            return { ...cur.state }
          },
        },
        desktop: { ...desktop, objects: api },
        log: (...parts: unknown[]): void => {
          console.log('[object ' + type + ':' + id + ']', ...parts)
        },
        vars: { ...vars },
        server: throwingSpine('server'),
        ai: throwingSpine('ai'),
        actions: throwingSpine('actions'),
      }
      return await fn(opCtx, params)
    },

    set: async (type: string, id: string, patch: Record<string, unknown>): Promise<DesktopObjectInstance> => {
      defOf(type)
      const key = type + ':' + id
      const db = readDb(file)
      const rec = db[key]
      if (!rec) throw new Error('no "' + type + '" instance "' + id + '"')
      rec.state = { ...rec.state, ...(patch ?? {}) }
      writeDb(file, db)
      return { id: rec.id, type: rec.type, state: { ...rec.state } }
    },

    remove: async (type: string, id: string): Promise<boolean> => {
      defOf(type)
      const key = type + ':' + id
      const db = readDb(file)
      if (!db[key]) return false
      delete db[key]
      writeDb(file, db)
      return true
    },
  }
  return api
}
