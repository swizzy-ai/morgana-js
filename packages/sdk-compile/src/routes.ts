/**
 * Wiring: http routes, unified triggers, frontend bindings.
 */
import { INTERACTION_EVENTS } from '@studiomorgana/sdk';
import type { SdkActionMeta } from './extract';
import { objectEventProblem, parseObjectSelector, type ObjectMeta } from './server-host/objects';
import {
  canonicalEvent,
  isBackendEvent,
  parseSelector,
  resolveBindings,
  type Binding,
  type BindingGraph,
} from './bindings';

export type { Binding };

/** Events the page runtime genuinely dispatches. A selector naming anything
 *  else cannot fire, so it is a build error rather than a dead binding. */
export const EMITTABLE = new Set([
  'clicked', 'changed', 'submitted', 'loaded', 'selected', 'picked', 'collided',
  'hover', 'focus', 'blur', 'dblclick', 'scroll', 'reset', 'resize', 'visibilitychange',
  // Component lifecycle — emitted by handle methods and delegation. Keep in
  // lockstep with EVENT_ALIASES in bindings.ts or subscriptions to these
  // compile and never fire.
  'copied', 'copyFailed', 'complete', 'notified', 'dismissed', 'cancelled',
  'closed', 'opened', 'patched', 'invalid', 'filtered', 'appended',
])

export interface HttpRoute {
  path: string
  method: string
  action: string
  auth?: 'public' | 'member'
  cors?: unknown
}

export interface Trigger {
  name: string
  run: string
  when?: Record<string, unknown>
  enabled?: boolean
  /** cron expression — set for schedule triggers, mutually exclusive with `event`. */
  cron?: string
  /** backend event selector — store:<n>:created | channel:<n> | action:<n>:completed | ... */
  event?: string
}

const HTTP_RE = /^http\.([a-z]+)\s+(\/\S*)$/i
const CRON_RE = /^cron\((.+)\)$/i
const FRONTEND_SELECTOR_RE = /^[a-z#][\w#.\-]*\.(click|change|input|submit|hover|focus|blur|scroll|dblclick)$/i

/** True when an `on` selector is a page-level frontend event (stays in client.js). */
export function isFrontendEvent(on: string): boolean {
  const t = on.trim()
  if ((INTERACTION_EVENTS as readonly string[]).includes(t)) return true
  if (/^state[:.]/i.test(t)) return true
  if (FRONTEND_SELECTOR_RE.test(t)) return true
  if (t.includes('#') && !t.includes(':') && !t.includes('/')) return true
  // Component lifecycle events (copied, complete, notified, ...) resolve
  // through the same alias table as clicks — a selector whose trailing
  // segment canonicalizes is frontend. Backend shapes (store:, channel:,
  // http, cron) never reach here: they contain ':'/'/'/'('.
  const seg = t.includes('.') ? (t.split('.').pop() ?? '') : t
  if (/^[a-z#][\w#.\-]*$/i.test(t) && !t.includes(':') && !t.includes('/') && !t.includes('(') && canonicalEvent(seg) !== null) return true
  return false
}

/** Normalize a state subscription selector to `state:<path>` form. */
export function normalizeStateEvent(on: string): string {
  const t = on.trim()
  const m = /^state[:.](.+)$/i.exec(t)
  return m ? `state:${m[1]}` : t
}

export function deriveRoutes(
  actions: SdkActionMeta[],
  hooks: Array<{ on: string | string[]; run: string | string[]; when?: Record<string, unknown>; auth?: 'public' | 'member'; cors?: unknown; enabled?: boolean }>,
  graph: BindingGraph,
  errors: string[] = [],
  objectsCheck: { objects: ObjectMeta[]; errors: string[] } = { objects: [], errors: [] },
): { apis: HttpRoute[]; triggers: Trigger[]; bindings: Binding[] } {
  const apis: HttpRoute[] = []
  const triggers: Trigger[] = []
  const bindings: Binding[] = []
  const seenApi = new Set<string>()
  const seenTrigger = new Set<string>()
  const seenBinding = new Set<string>()

  const laneOf = new Map(actions.map((a) => [a.name, a.lane]))
  const pushOn = (actionName: string, on: string, when?: Record<string, unknown>, auth?: 'public' | 'member', cors?: unknown, enabled?: boolean) => {
    const t = on.trim()
    if (t === 'compile' || t === '') return
    // Server objects: `object:<type>[/<name>].<event>`. A server action gets a
    // durable trigger; a client action listens to one instance over the
    // page's live connection, so it must name it.
    if (/^object:/i.test(t)) {
      const fail = (msg: string) => objectsCheck.errors.push(`action "${actionName}": on '${t}' — ${msg}`)
      const sel = parseObjectSelector(t)
      if (!sel) return fail('write object:<type>.<event> or object:<type>/<name>.<event>')
      const meta = objectsCheck.objects.find((m) => m.name === sel.type)
      if (!meta) {
        const known = objectsCheck.objects.map((m) => m.name).join(', ')
        return fail(`there is no server object "${sel.type}"${known ? ` (there is: ${known})` : ''}`)
      }
      const problem = objectEventProblem(meta, sel.event)
      if (problem) return fail(problem)
      if (laneOf.get(actionName) === 'client') {
        if (!sel.name) return fail(`a client action listens to one instance — object:${sel.type}/<name>.${sel.event}`)
        const key = `${t} -> ${actionName}`
        if (!seenBinding.has(key)) {
          seenBinding.add(key)
          bindings.push({ event: t, action: actionName })
        }
        return
      }
      const name = `${actionName}:${t}`
      if (!seenTrigger.has(name)) {
        seenTrigger.add(name)
        triggers.push({ name, event: t, run: actionName, when, enabled })
      }
      return
    }
    const http = HTTP_RE.exec(t)
    if (http) {
      const key = `${http[1]!.toUpperCase()} ${http[2]}`
      if (!seenApi.has(key)) {
        seenApi.add(key)
        apis.push({ path: http[2]!, method: http[1]!.toUpperCase(), action: actionName, auth, cors })
      }
      return
    }
    // A server-lane selector goes to triggers before the frontend ever sees it.
    // Everything else that fails to parse is offered to the frontend resolver,
    // which reports it rather than letting it become a dead trigger.
    if (isBackendEvent(t)) {
      const cron = CRON_RE.exec(t)
      if (cron) {
        const name = `${actionName}:cron`
        if (!seenTrigger.has(name)) {
          seenTrigger.add(name)
          triggers.push({ name, cron: cron[1]!.trim(), run: actionName, enabled })
        }
        return
      }
      const name = `${actionName}:${t}`
      if (!seenTrigger.has(name)) {
        seenTrigger.add(name)
        triggers.push({ name, event: t, run: actionName, when, enabled })
      }
      return
    }

    // Frontend: an event, optionally scoped to an object and/or a prop.
    const parsed = parseSelector(t)
    if (parsed.kind === 'state' && parsed.event) {
      // A state path is already fully qualified — `state:hero.open` names the
      // object by its own state namespace, so it needs no origin.
      const key = `${parsed.event} -> ${actionName}`
      if (!seenBinding.has(key)) {
        seenBinding.add(key)
        bindings.push({ event: normalizeStateEvent(t), action: actionName })
      }
      return
    }
    // `unknown` reaches here too, so an unrecognised name is reported rather than
    // silently becoming a server trigger.
    if (parsed.kind === 'event' || parsed.kind === 'unknown') {
      for (const b of resolveBindings(parsed, actionName, graph, errors)) {
        const key = `${b.event}|${b.origin ?? '*'}|${b.prop ?? '*'} -> ${actionName}`
        if (seenBinding.has(key)) continue
        seenBinding.add(key)
        bindings.push(b)
      }
      return
    }
  }

  for (const a of actions) {
    if (a.enabled === false) continue
    for (const on of a.on) pushOn(a.name, on, a.when, a.auth, a.cors, a.enabled)
  }
  for (const h of hooks) {
    if (h.enabled === false) continue
    const ons = Array.isArray(h.on) ? h.on : [h.on]
    const runs = Array.isArray(h.run) ? h.run : [h.run]
    for (const run of runs) {
      for (const on of ons) pushOn(run, on, h.when, h.auth, h.cors, h.enabled)
    }
  }
  apis.sort((a, b) => a.path.localeCompare(b.path))
  triggers.sort((a, b) => a.name.localeCompare(b.name))
  bindings.sort(
    (a, b) =>
      a.event.localeCompare(b.event) ||
      (a.origin ?? '').localeCompare(b.origin ?? '') ||
      (a.prop ?? '').localeCompare(b.prop ?? '') ||
      a.action.localeCompare(b.action),
  )
  return { apis, triggers, bindings }
}
