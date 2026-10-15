/**
 * Conditions — how an object looks while something is true.
 *
 *   box.setProps({ conditions: {
 *     'view=work':            { hidden: false },      // a state value
 *     'view=brief|work':      { opacity: 1 },         // any of several values
 *     '#composer:dragover':   { hidden: false },      // another object's state
 *     ':last':                { color: 'text' },      // its row is the last in its list
 *     'panel=open & @split':  { pad: '…' },           // all of them, on a breakpoint
 *   } })
 *
 * Every condition compiles to a plain CSS selector, so a change on screen
 * costs the browser one attribute write: the runtime reflects the state keys
 * conditions use onto <html> (`data-s-view="work"`) and the stylesheet does
 * the rest. Nothing is resolved in the browser.
 *
 * Motion rides on the same rules: `appear` is where an object starts when it
 * shows (or is stamped into a list), `leave` is where it ends as it hides.
 * Both compile to transitions and `@starting-style`, inside
 * `prefers-reduced-motion: no-preference`.
 */
import { cssDeclsToString, resolvePropsToCss, type StyleCtx } from './props'

export type ConditionPart =
  | { type: 'state'; key: string; values: string[] }
  | { type: 'screen'; name: string }
  | { type: 'object'; id: string; state: string }
  | { type: 'position'; nth: 'first' | 'last' | number }

/** Motion: where an object starts as it appears, or ends as it leaves. */
export interface Motion {
  opacity?: number
  transform?: string
  /** Duration in ms (default 400). */
  ms?: number
  easing?: string
}

const OBJECT_STATES: Record<string, string> = {
  dragover: '[data-dragover]',
  hover: ':hover',
  focus: ':focus-within',
  dragging: '[data-dragging]',
}

/** The attribute a state key is reflected under: `build.state` → `data-s-build-state`. */
export function stateAttr(key: string): string {
  return `data-s-${key.replace(/[^a-zA-Z0-9-]/g, '-')}`
}

export function parseCondition(key: string): ConditionPart[] {
  const parts: ConditionPart[] = []
  for (const raw of key.split('&')) {
    const p = raw.trim()
    if (!p) continue
    if (p.startsWith('@')) {
      parts.push({ type: 'screen', name: p.slice(1) })
      continue
    }
    if (p.startsWith('#')) {
      const [id, state = ''] = p.slice(1).split(':')
      if (!OBJECT_STATES[state]) throw new Error(`[Morgana] condition "${p}": "${state}" is not an object state (${Object.keys(OBJECT_STATES).join(', ')})`)
      parts.push({ type: 'object', id: id!, state })
      continue
    }
    if (p.startsWith(':')) {
      const m = /^:(first|last|fromEnd\((\d+)\))$/.exec(p)
      if (!m) throw new Error(`[Morgana] condition "${p}": use :first, :last or :fromEnd(n)`)
      parts.push({ type: 'position', nth: m[1] === 'first' ? 'first' : m[1] === 'last' ? 'last' : Number(m[2]) })
      continue
    }
    const eq = p.indexOf('=')
    if (eq <= 0) throw new Error(`[Morgana] condition "${p}": write key=value, @screen, #object:state or :last`)
    parts.push({ type: 'state', key: p.slice(0, eq).trim(), values: p.slice(eq + 1).split('|').map((v) => v.trim()) })
  }
  return parts
}

/** The state keys an object's conditions read — the runtime reflects these. */
export function conditionStateKeys(props: Record<string, unknown>): string[] {
  const conds = props['conditions']
  if (!conds || typeof conds !== 'object') return []
  const keys = new Set<string>()
  for (const key of Object.keys(conds)) {
    for (const part of parseCondition(key)) if (part.type === 'state') keys.add(part.key)
  }
  return [...keys]
}

/** True when a condition shows or hides the object — its base `hidden` then lives in the sheet. */
export function togglesVisibility(props: Record<string, unknown>): boolean {
  const conds = props['conditions']
  if (!conds || typeof conds !== 'object') return false
  return Object.values(conds as Record<string, unknown>).some((p) => p && typeof p === 'object' && 'hidden' in (p as object))
}

/** Where the object sits: its own id, and the template row it belongs to (if any). */
export interface ConditionTarget {
  id: string
  /** Every selector the object is reached by (its entity, and its stamped rows). */
  selectors: string[]
  /** The template root this object is inside, when it is part of a list's row. */
  rowRoot: string | null
  /** The object's display when shown — from its base CSS. */
  shownDisplay: string
}

function positionSelector(nth: 'first' | 'last' | number): string {
  return nth === 'first' ? ':first-child' : nth === 'last' ? ':last-child' : `:nth-last-child(${nth})`
}

/** The selectors one condition key compiles to, for this object. */
export function conditionSelectors(target: ConditionTarget, parts: ConditionPart[]): string[] {
  // :root qualifiers — every combination of the state values asked for.
  let roots: string[] = [':root']
  for (const part of parts) {
    if (part.type === 'state') {
      const attr = stateAttr(part.key)
      roots = roots.flatMap((r) => part.values.map((v) => `${r}[${attr}="${v.replace(/["\\]/g, '\\$&')}"]`))
    } else if (part.type === 'object') {
      roots = roots.map((r) => `${r}:has([data-entity="${part.id}"]${OBJECT_STATES[part.state]})`)
    }
  }
  const position = parts.find((p): p is Extract<ConditionPart, { type: 'position' }> => p.type === 'position')
  let selves = target.selectors
  if (position) {
    const nth = positionSelector(position.nth)
    selves = target.rowRoot && target.rowRoot !== target.id
      ? target.selectors.map((s) => `[data-tpl="${target.rowRoot}"]${nth} ${s}`)
      : target.selectors.map((s) => `${s}${nth}`)
  }
  const needsRoot = roots.length > 1 || roots[0] !== ':root'
  return roots.flatMap((r) => selves.map((s) => (needsRoot ? `${r} ${s}` : s)))
}

function motionOf(v: unknown): Motion | null {
  return v && typeof v === 'object' ? (v as Motion) : null
}

/** Motion values as declarations. */
function motionDecls(m: Motion): Record<string, string> {
  const out: Record<string, string> = {}
  if (m.opacity !== undefined) out['opacity'] = String(m.opacity)
  if (m.transform !== undefined) out['transform'] = m.transform
  return out
}

/**
 * Every condition rule for one object, plus its motion. `mediaQuery` turns a
 * breakpoint name into its query (or null when it has none).
 */
export function conditionRules(
  target: ConditionTarget,
  kind: string,
  props: Record<string, unknown>,
  ctx: StyleCtx,
  mediaQuery: (bp: string) => string | null,
): string[] {
  const out: string[] = []
  const conds = (props['conditions'] && typeof props['conditions'] === 'object' ? props['conditions'] : {}) as Record<string, Record<string, unknown>>
  const appear = motionOf(props['appear'])
  const leave = motionOf(props['leave'])
  const base = target.selectors.join(',')

  // Base hidden state, when conditions decide visibility (the inline
  // display:none would beat every condition rule).
  if (togglesVisibility(props) && (props['hidden'] === true || props['hidden'] === 'true')) {
    out.push(`${base}{display:none${leave ? `;${cssDeclsToString(motionDecls(leave))}` : ''}}`)
  }

  for (const [key, cprops] of Object.entries(conds)) {
    if (!cprops || typeof cprops !== 'object') continue
    const parts = parseCondition(key)
    const { hidden, ...rest } = cprops
    const decls: Record<string, string> = {}
    if (hidden === false) {
      decls['display'] = target.shownDisplay
      // Back from where `leave` parked it.
      if (leave) {
        if (leave.opacity !== undefined) decls['opacity'] = '1'
        if (leave.transform !== undefined) decls['transform'] = 'none'
      }
    } else if (hidden === true) {
      decls['display'] = 'none'
      if (leave) Object.assign(decls, motionDecls(leave))
    }
    // Kind-neutral, like state styles: a condition restyles only what it names.
    Object.assign(decls, resolvePropsToCss(rest, '__state', ctx))
    const body = cssDeclsToString(decls)
    if (!body) continue
    const rule = `${conditionSelectors(target, parts).join(',')}{${body}}`
    const screens = parts.filter((p): p is Extract<ConditionPart, { type: 'screen' }> => p.type === 'screen')
    const queries = screens.map((s) => mediaQuery(s.name)).filter((q): q is string => !!q)
    out.push(queries.length ? `@media ${queries.join(' and ')}{${rule}}` : rule)
  }
  void kind

  if (appear || leave) {
    const ms = Math.max(appear?.ms ?? 0, leave?.ms ?? 0) || 400
    const easing = appear?.easing ?? leave?.easing ?? 'cubic-bezier(.2,.8,.2,1)'
    const animated = new Set<string>()
    for (const m of [appear, leave]) {
      if (m?.opacity !== undefined) animated.add('opacity')
      if (m?.transform !== undefined) animated.add('transform')
    }
    const list = [...animated].map((p) => `${p} ${ms}ms ${easing}`)
    // A hidden object stays on screen while it leaves.
    if (leave && togglesVisibility(props)) list.push(`display ${ms}ms allow-discrete`)
    const motion: string[] = [`${base}{transition:${list.join(',')}}`]
    if (appear) motion.push(`@starting-style{${base}{${cssDeclsToString(motionDecls(appear))}}}`)
    out.push(`@media (prefers-reduced-motion:no-preference){${motion.join('')}}`)
  }
  return out
}
