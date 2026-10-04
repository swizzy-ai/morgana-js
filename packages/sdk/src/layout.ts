/**
 * Layout vocabulary — the declarative placement & measurement language.
 *
 * The enemy here is raw CSS: nothing in this module (or anywhere on the SDK
 * surface) contains a CSS string. Every length is a `Dim` — a number in
 * base-grid units or a named measure token from the central `MeasureApi`
 * registry — and every position is expressed through the typed `Placement`
 * vocabulary. CSS synthesis happens at the very edge, inside the engine's
 * layout resolver.
 *
 * Stacking uses LAYERS, not z-index: a signed number where `0` is the base
 * layer of a page/container, minus goes below, plus goes above. The same
 * vocabulary maps 1:1 onto the upcoming graphics lane.
 */

import type { AlignToken } from './props'

/**
 * A functional measure expression — arithmetic over named measures, so a
 * known measure is declared ONCE and every derived length respects it:
 * `sidebar × 2`, `sidebar + gap`. Resolved lazily by the engine at style
 * time against the live registry, so redefining `sidebar` re-scales every
 * consumer automatically.
 */
export interface MeasureExpr {
  /** The base named measure (e.g. `'sidebar'`). */
  of: string
  /** Multiply the base measure (e.g. `2` for "sidebar space × 2"). */
  mul?: number
  /** Add on top — units or another named measure (e.g. `'gap'`). */
  add?: Dim
}

/** Factory for measure expressions — `dim('sidebar', { mul: 2 })`. */
export const dim = (of: string, ops?: { mul?: number; add?: Dim }): MeasureExpr => ({
  of,
  ...ops,
})

/**
 * A declared length. Numbers are base-grid units (see `MeasureApi.unit`,
 * default 4px-per-unit to match the `pad`/`gap` token semantics). Strings are
 * named measure tokens from the central registry (`'sm'`, `'md'`, `'page'`…)
 * or the sizing modes `'fill'` / `'hug'` / `'stretch'`. Objects are
 * functional expressions over named measures (`dim('sidebar', { mul: 2 })`).
 * No raw px/CSS.
 */
export type Dim = number | 'fill' | 'hug' | 'stretch' | MeasureExpr | (string & {})

/** Sizing modes — the named non-numeric lengths. */
export const SIZE_MODES = ['fill', 'hug', 'stretch'] as const
export type SizeMode = (typeof SIZE_MODES)[number]

/**
 * Placement mode — how an object sits inside its parent surface:
 * - `flow`: in-flow with the parent's layout (default).
 * - `free`: positioned at explicit coordinates inside the parent
 *   (`at: [x, y]` in units), overlapping siblings.
 * - `pin`: anchored to the page/viewport instead of the parent.
 */
export const PLACEMENT_MODES = ['flow', 'free', 'pin'] as const
export type PlacementMode = (typeof PLACEMENT_MODES)[number]

/** The 9 placement anchors — which point of the object sits at `at`. */
export const ANCHORS = [
  'top-start', 'top', 'top-end',
  'start', 'center', 'end',
  'bottom-start', 'bottom', 'bottom-end',
] as const
export type AnchorToken = (typeof ANCHORS)[number]

/** Overflow behavior tokens for a surface. */
export const OVERFLOW_MODES = ['visible', 'hidden', 'scroll'] as const
export type OverflowToken = (typeof OVERFLOW_MODES)[number]

/**
 * Placement config — the typed vocabulary for `place(child, placement)` and
 * `move()`. Previously an untyped record; every field is optional and the
 * engine ignores what it doesn't know.
 */
export interface Placement {
  /** How the object sits inside its parent. Inferred as `free` when `at` is set. */
  mode?: PlacementMode
  /** Position inside the parent (units) — `[x, y]` from the parent's top-start. */
  at?: [Dim, Dim]
  /** Which point of the object sits at `at` (default `top-start`). */
  anchor?: AnchorToken
  /** Explicit size, overriding the object's own width/height props. */
  size?: { w?: Dim; h?: Dim }
  /** Named child surface of the parent to render into. */
  slot?: string
  /** Flow ordering among siblings. */
  order?: number
  /** Flex grow factor when the parent distributes free space. */
  grow?: number
  /** Cross-axis alignment override for this object within the parent. */
  self?: AlignToken
  /** Stack layer inside the parent — base is 0, minus below, plus above. */
  layer?: number
  /** Grid placement — 1-based `[col, row]` cell (static grids). */
  cell?: [number, number]
  /** How many grid tracks the object occupies. */
  span?: { cols?: number; rows?: number }
  /** Named grid area (requires the container to declare matching areas). */
  area?: string
}

/** Grid auto-placement strategies. */
export const GRID_FLOWS = ['row', 'col', 'dense'] as const
export type GridFlow = (typeof GRID_FLOWS)[number]

/**
 * The declarative grid vocabulary — a container declares the entire grid;
 * children flow into it (data-mapped) or declare `cell`/`span` in their
 * Placement (static). Tracks use the same `Dim` language (`'fill'` → 1fr).
 * No raw CSS anywhere — the engine compiles this at the edge.
 */
export interface GridSpec {
  /** Column count — a number, or 'auto' for auto-fill. */
  cols?: number | 'auto'
  /** Explicit row count; omit for content-driven rows. */
  rows?: number
  /** Track widths — one Dim for all columns, or one per track. */
  colW?: Dim | Dim[]
  /** Implicit row height (default: content-driven). */
  rowH?: Dim
  /** Auto-placement strategy — 'dense' backfills gaps left by spanning items. */
  flow?: GridFlow
}

/**
 * The central measurement registry — the single source of named lengths and
 * the base-grid unit size. Mirrors the `BreakpointsApi` contract shape:
 * declare once (shape phase / config actions), resolve everywhere. No px,
 * no raw CSS — lengths are units and names.
 */
export interface MeasureApi {
  /** Base-grid units per single numeric `Dim` unit (default 4). */
  readonly unit: number
  /** Create-or-overwrite a named measure (value in units). */
  define(name: string, units: number): void
  /** The unit value of a named measure. */
  get(name: string): number | undefined
  /** Is this measure name shaped? */
  has(name: string): boolean
  /** Every named measure. */
  entries(): [string, number][]
  /** Remove a named measure. */
  remove(name: string): void
}
