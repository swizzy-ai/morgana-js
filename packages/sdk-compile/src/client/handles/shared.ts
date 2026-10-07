/**
 * Shared context handed to kind-specific handle extensions.
 *
 * The base `ObjectHandle` is one shape for every kind (runtime.makeObject).
 * The typed methods each kind declares are layered on top by the modules in
 * this directory, so neither the base nor any single kind file grows without
 * bound.
 */
import type { ManifestObject } from '../../render/manifest'

export interface HandleCtx {
  id: string
  kind: string
  meta: ManifestObject
  el: HTMLElement | null
  setProp(prop: string, value: unknown): void
  getProp(prop: string): unknown
  emit(event: string, payload?: unknown): void
  handle: Record<string, unknown>
  /** Re-run derived (function-valued) props. */
  reevaluate(): void
  /** Base-grid px-per-unit for Dim resolution (animation distances). */
  unit?: number
  /** Named measure values in grid units, for Dim resolution. */
  measures?: Record<string, number>
}

/**
 * Apply an extension map onto a handle, in place.
 *
 * Descriptors, not entries: some extensions declare accessor properties
 * (`get value()` on inputs), and `Object.entries` would invoke the getter
 * once and store the snapshot — every later read would return the value the
 * field had when the handle was built. That is how an input kept submitting
 * its first value forever.
 */
export function extend(ctx: HandleCtx, methods: Record<string, unknown>): void {
  Object.defineProperties(ctx.handle, Object.getOwnPropertyDescriptors(methods))
}

/** Text content of an element, or ''. */
export function textOf(el: Element | null): string {
  return el?.textContent ?? ''
}

/** Replace an element's text, falling back to a prop write when detached. */
export function setText(ctx: HandleCtx, value: unknown): void {
  if (ctx.el) ctx.el.textContent = value === null || value === undefined ? '' : String(value)
  else ctx.setProp('content', value)
}

/** Toggle a part element's `hidden` attribute. */
export function setPartVisible(el: Element | null, part: string, visible: boolean): void {
  const node = el?.querySelector(`[data-part="${part}"]`)
  if (!node) return
  if (visible) node.removeAttribute('hidden')
  else node.setAttribute('hidden', '')
}
