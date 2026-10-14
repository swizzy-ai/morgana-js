/**
 * State styles — `hover`, `focus`, `active`, `disabled` as props.
 *
 *   button.setProps({ bg: 'primary', hover: { bg: '#4338CA' }, focus: { boxShadow: '0 0 0 3px #A5B4FC' } })
 *
 * Each state takes the same style props as the object itself and compiles to a
 * rule on the object's own selector. The declarations are `!important` on
 * purpose: a state must win over the object's base styles whether those came
 * from the stylesheet or from a runtime `set()` (which writes inline styles).
 */
import { resolvePropsToCss, type StyleCtx } from './props'

export const STATE_SELECTORS: Record<string, string[]> = {
  hover: [':hover'],
  focus: [':focus-visible', ':focus-within'],
  active: [':active'],
  disabled: [':disabled', '[data-disabled="true"]', '[aria-disabled="true"]'],
}

export const STATE_PROPS = new Set(Object.keys(STATE_SELECTORS))

/** CSS rules for an object's state props. */
export function stateRules(selector: string, kind: string, props: Record<string, unknown>, ctx: StyleCtx): string[] {
  const out: string[] = []
  for (const [state, suffixes] of Object.entries(STATE_SELECTORS)) {
    const spec = props[state]
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) continue
    // Resolved kind-neutral: a state restyles only what it names. Resolving as
    // the object's kind dragged that kind's defaults (a button's padding and
    // radius) into every hover rule.
    void kind
    const css = resolvePropsToCss(spec as Record<string, unknown>, '__state', ctx)
    const decls = Object.entries(css)
      .map(([k, v]) => `${k}:${v} !important`)
      .join(';')
    if (!decls) continue
    out.push(`${suffixes.map((s) => `${selector}${s}`).join(',')}{${decls}}`)
  }
  return out
}
