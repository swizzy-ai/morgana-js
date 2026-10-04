/**
 * Frontend binding selectors.
 *
 * `on:` names *what* should run an action. The grammar:
 *
 *   clicked                     any object
 *   myButton.clicked            one object
 *   #myButton.clicked           one object, CSS-ish
 *   myButton.label.changed      one prop of one object
 *   state:myWidget.open         a state path (already worked)
 *
 * The last segment is always the event, and the arity is fixed — one segment is
 * the event, two are object + event, three are object + prop + event. That
 * keeps `price.changed` meaning "the `price` object changed" rather than being
 * ambiguous with a prop watcher. An object id that itself contains a dot is
 * resolved against the graph, so `nav.item.clicked` still works when `nav.item`
 * is a real id.
 *
 * Three bugs this fixes, all of which produced a binding that compiled, shipped,
 * and did nothing:
 *
 *   1. The object was discarded, so `on: 'clicked'` fired for a click on *any*
 *      object on the page.
 *   2. The selector form accepted `click`/`change`/`submit`/`hover`/`focus`/`blur`,
 *      which the runtime never dispatches — it emits `clicked`/`changed`/
 *      `submitted`/`hover`/`focus`/`blur`. Those bindings could never fire.
 *   3. A custom object's declared events were not recognised, so they fell
 *      through to server triggers.
 *
 * Anything unresolvable is a **build error**, not silence. That is the whole
 * point: a selector naming an object that does not exist, or an event nothing
 * emits, is a mistake worth failing on.
 */

/** A compiled frontend binding. */
export interface Binding {
  /** Canonical event name, or `prop:changed` for a prop watcher. */
  event: string
  action: string
  /** Object id, or undefined for "any object". */
  origin?: string
  /** Prop name, for a prop watcher. */
  prop?: string
}

/**
 * Friendly names → what the runtime actually dispatches.
 *
 * The catalog (`INTERACTION_EVENTS`) and the runtime had drifted: the catalog
 * said `entered`/`exited` where the runtime dispatches `hover`/`focus`/`blur`.
 * The runtime is the truth, since nothing fires on a catalog-only name.
 */
const EVENT_ALIASES: Record<string, string> = {
  // interaction
  clicked: 'clicked',
  click: 'clicked',
  changed: 'changed',
  change: 'changed',
  input: 'changed',
  submitted: 'submitted',
  submit: 'submitted',
  loaded: 'loaded',
  load: 'loaded',
  selected: 'selected',
  picked: 'picked',
  collided: 'collided',
  // pointer / focus. The runtime dispatches these literally.
  hover: 'hover',
  hovered: 'hover',
  mouseenter: 'hover',
  entered: 'hover',
  focus: 'focus',
  focused: 'focus',
  focusin: 'focus',
  blur: 'blur',
  blurred: 'blur',
  focusout: 'blur',
  exited: 'blur',
  // passed through
  dblclick: 'dblclick',
  scroll: 'scroll',
  reset: 'reset',
  resize: 'resize',
  visibilitychange: 'visibilitychange',
}

/** The event a prop watcher dispatches. Namespaced so it cannot collide. */
export const PROP_CHANGED = 'prop:changed'

/** Canonicalize a friendly event name, or null when nothing emits that name. */
export function canonicalEvent(raw: string): string | null {
  return EVENT_ALIASES[raw.trim().toLowerCase()] ?? null
}

/**
 * Backend/system event shapes — `store.orders.created`, `channel:ops`,
 * `action:success`, `cron`. These belong on the server lane, so they are
 * routed as triggers rather than offered to the frontend resolver.
 *
 * This is what lets everything *else* that fails to parse be reported as a
 * mistake. Without it, a typo like `cta.clickked` would quietly become a
 * server trigger and fire never — the original bug.
 */
const BACKEND_RE = /^(?:store|channel|deployment|queue|asset|file|agent)[:.]/i
const SYSTEM_RE = /^(?:action:|deploy$|cron\()/i

export function isBackendEvent(raw: string): boolean {
  const t = raw.trim()
  return BACKEND_RE.test(t) || SYSTEM_RE.test(t)
}

export type SelectorKind = 'event' | 'state' | 'unknown'

export interface ParsedSelector {
  kind: SelectorKind
  raw: string
  /** Canonical event name — `prop:changed` when a prop is in scope. */
  event?: string
  origin?: string
  prop?: string
  /** The friendly name the author wrote, for error messages. */
  friendly: string
  /** The last segment, kept so resolution can check custom-object events. */
  last: string
}

const STATE_RE = /^state[:.]/i

/**
 * Parse an `on:` selector. Assumes it is not an http/cron/backend selector —
 * those are routed before this is reached.
 */
export function parseSelector(raw: string): ParsedSelector {
  const t = raw.trim()
  const friendly = t

  if (STATE_RE.test(t)) {
    const path = t.replace(STATE_RE, '')
    return { kind: 'state', raw: t, event: `state:${path}`, friendly, last: t }
  }

  const segments = t.split('.')
  const last = segments[segments.length - 1]!
  const canonical = canonicalEvent(last)

  if (segments.length === 1) {
    return canonical
      ? { kind: 'event', raw: t, event: canonical, friendly, last }
      : { kind: 'unknown', raw: t, friendly, last }
  }

  // Fixed arity: 2 segments is object + event. 3 or more is object + prop + event,
  // with any further segments folded back into the object id (resolved later).
  const hasProp = segments.length >= 3
  const head = segments.slice(0, -1)
  const origin = head.slice(0, hasProp ? head.length - 1 : head.length).join('.').replace(/^#/, '')
  const prop = hasProp ? head[head.length - 1]!.replace(/^#/, '') : undefined

  if (!canonical) return { kind: 'unknown', raw: t, friendly, last }

  // A prop watcher is namespaced, so it cannot collide with the object's own
  // `changed` event.
  const event = hasProp ? PROP_CHANGED : canonical

  return origin || prop
    ? { kind: 'event', raw: t, event, origin: origin || undefined, prop, friendly, last }
    : { kind: 'event', raw: t, event, friendly, last }
}

/** What the resolver needs to know about the compiled project. */
export interface BindingGraph {
  /** Every object id in the graph. */
  objectIds: Set<string>
  /** Object id → its descendant ids, for expanding a component scope. */
  children: Map<string, string[]>
  /** Custom object names. A binding on one expands to its descendants. */
  componentNames: Set<string>
  /** Every event a custom object declares. */
  componentEvents: Set<string>
  /** The component that created an object, if any. */
  componentOf: Map<string, string>
  /** Events the page runtime can actually dispatch. */
  emittable: Set<string>
}

/** All descendants of an id, depth-first, excluding the id itself. */
export function descendantsOf(graph: BindingGraph, id: string, seen = new Set<string>()): string[] {
  const out: string[] = []
  for (const child of graph.children.get(id) ?? []) {
    if (seen.has(child)) continue
    seen.add(child)
    out.push(child, ...descendantsOf(graph, child, seen))
  }
  return out
}

/**
 * Turn a parsed selector into concrete bindings.
 *
 * A binding on a custom object's own id expands to that object *and* its
 * descendants: a `video-player` places real `video` and `caption` objects, and a
 * click on the video fires with the video's id, not the player's. Expanding at
 * compile time keeps the manifest honest — it lists the bindings that actually
 * exist — instead of asking the user to name the component's internals in every
 * action that touches it.
 */
export function resolveBindings(
  parsed: ParsedSelector,
  actionName: string,
  graph: BindingGraph,
  errors: string[],
): Binding[] {
  // An unrecognised name may still be a custom object's declared event, which
  // only the graph knows about. It was a server trigger before this.
  if (parsed.kind === 'unknown' && graph.componentEvents.has(parsed.last)) {
    const canonicalCustom = parsed.last
    // A bare `opened` names no object. Only a scoped `player.opened` has one.
    const hasOrigin = parsed.raw.includes('.')
    const origin = hasOrigin ? parsed.raw.split('.')[0]!.replace(/^#/, '') : undefined
    if (origin && !graph.objectIds.has(origin) && !graph.componentNames.has(origin)) {
      errors.push(
        `action "${actionName}" listens on "${parsed.friendly}" — no object named "${origin}" exists`,
      )
      return []
    }
    if (origin) {
      const componentName = graph.componentOf.get(origin)
      const ids =
        componentName !== undefined || graph.componentNames.has(origin)
          ? [origin, ...descendantsOf(graph, origin)]
          : [origin]
      return ids.map((id) => ({ event: canonicalCustom as string, action: actionName, origin: id }))
    }
    return [{ event: canonicalCustom, action: actionName }]
  }

  if (parsed.kind === 'unknown') {
    errors.push(
      `action "${actionName}" listens on "${parsed.friendly}" — nothing dispatches "${parsed.friendly}"`,
    )
    return []
  }

  if (parsed.kind !== 'event' || !parsed.event) return []

  // `nav.item.clicked` parsed as object `nav` + prop `item`. If `nav` is not real
  // but `nav.item` is, the author's id contains a dot — prefer that reading.
  let origin = parsed.origin
  let prop = parsed.prop
  let event = parsed.event
  if (origin && prop && !graph.objectIds.has(origin) && graph.objectIds.has(`${origin}.${prop}`)) {
    // The id has a dot in it. Collapse back to a plain object+event binding, so
    // the `prop:changed` promotion is undone with it.
    origin = `${origin}.${prop}`
    prop = undefined
    event = canonicalEvent(parsed.last) ?? event
  }

  if (origin && !graph.objectIds.has(origin)) {
    // A custom object name is also a valid scope, since it created an object.
    if (!graph.componentNames.has(origin)) {
      errors.push(
        `action "${actionName}" listens on "${parsed.friendly}" — no object named "${origin}" exists`,
      )
      return []
    }
  }

  // The event must be one something can actually dispatch, whether that is a
  // DOM event or a custom object's declared event.
  const isCustomEvent = graph.componentEvents.has(parsed.last)
  if (event !== PROP_CHANGED && !isCustomEvent && !graph.emittable.has(event)) {
    errors.push(
      `action "${actionName}" listens on "${parsed.friendly}" — nothing dispatches "${parsed.friendly}"`,
    )
    return []
  }

  if (!origin) return [{ event, action: actionName, prop }]

  // A component scope: the object itself, plus everything inside it. A
  // `video-player` places real objects, and a click on the video fires with the
  // video's id — so the scope has to include them or it would never fire.
  const componentName = graph.componentOf.get(origin)
  const isComponentScope = componentName !== undefined || graph.componentNames.has(origin)
  const ids = isComponentScope ? [origin, ...descendantsOf(graph, origin)] : [origin]

  return ids.map((id) => ({ event: event!, action: actionName, origin: id, prop }))
}

/**
 * Build the graph `resolveBindings` validates and expands against, from the
 * compiled IR. This is why binding resolution runs after the compile lane: by
 * then every object exists, including the interiors a custom object stamped.
 */
export function buildBindingGraph(ir: {
  objects: Map<string, { id: string; children: string[]; customObject?: string }>
  customObjects: Map<string, { events: string[] }>
}, emittable: Set<string>): BindingGraph {
  const objectIds = new Set<string>()
  const children = new Map<string, string[]>()
  const componentOf = new Map<string, string>()
  const componentNames = new Set<string>()
  const componentEvents = new Set<string>()

  for (const node of ir.objects.values()) {
    objectIds.add(node.id)
    children.set(node.id, [...node.children])
    if (node.customObject) {
      componentOf.set(node.id, node.customObject)
      componentNames.add(node.customObject)
    }
  }
  for (const decl of ir.customObjects.values()) {
    for (const e of decl.events) componentEvents.add(e)
  }

  return { objectIds, children, componentNames, componentEvents, componentOf, emittable }
}
