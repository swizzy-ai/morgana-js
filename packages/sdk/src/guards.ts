/**
 * Guards — the existing engine GuardSpec, evaluated before invocation.
 * Two equivalent declaration forms compile to this:
 *   1. the guard prop (dispatch language / studio / entities)
 *   2. the stem annotation, declared next to the handler
 */

export interface GuardSpec {
  requireAuth?: boolean
  roles?: string[]
  /** Any of `roles` grants access (instead of rank ordering). */
  anyRole?: boolean
}

/** Role ranks used by guard evaluation (engine law: member < admin < owner). */
export const ROLE_RANKS = { member: 1, admin: 2, owner: 3 } as const

/** Stem annotations — declared as comments next to the handler. */
export const STEM_BIND = '@morgana-bind'
export const STEM_GUARD = '@morgana-guard'
