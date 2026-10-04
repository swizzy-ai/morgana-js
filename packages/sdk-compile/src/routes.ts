/**
 * Wiring: http routes, unified triggers, frontend bindings.
 */
import { INTERACTION_EVENTS } from '@morgana/sdk';
import type { SdkActionMeta } from './extract';
import {
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
): { apis: HttpRoute[]; triggers: Trigger[]; bindings: Binding[] } {
  const apis: HttpRoute[] = []
  const triggers: Trigger[] = []
  const bindings: Binding[] = []
  const seenApi = new Set<string>()
  const seenTrigger = new Set<string>()
  const seenBinding = new Set<string>()

  const pushOn = (actionName: string, on: string, when?: Record<string, unknown>, auth?: 'public' | 'member', cors?: unknown, enabled?: boolean) => {
    const t = on.trim()
    if (t === 'compile' || t === '') return
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
