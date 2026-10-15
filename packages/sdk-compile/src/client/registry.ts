/**
 * What the page runtime can do for each kind, registered by the generated
 * runtime entry (bundle.ts) — so a page ships only the code for the kinds its
 * project uses. A kind with no builder here simply gets the base handle.
 */
import { extend, type HandleCtx } from './handles/shared'

type Builder = (ctx: HandleCtx) => Record<string, unknown>

export const registry = {
  /** kind → the methods its typed handle declares. */
  byKind: {} as Record<string, Builder>,
  /** `handle.animate` — every kind gets it. */
  animate: null as ((ctx: HandleCtx) => void) | null,
  /** Painters for semantic props (checked, progress value, chart, QR). */
  paint: {} as {
    checked?: (el: HTMLElement, on: boolean) => void
    progress?: (el: HTMLElement, value: number, max: number) => void
    chart?: (el: HTMLElement, spec: { kind?: string; series?: unknown; labels?: unknown; palette?: unknown }) => void
    qr?: (props: Record<string, unknown>) => string
  },
}

/** Layer on the kind-specific methods, from whatever was registered. */
export function extendFromRegistry(ctx: HandleCtx): void {
  registry.animate?.(ctx)
  const build = registry.byKind[ctx.kind]
  if (build) extend(ctx, build(ctx))
}
