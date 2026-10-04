/**
 * Handle extension assembly.
 *
 * The base `ObjectHandle` is built once in `makeObject`; the methods each
 * typed handle declares (DialogHandle.open, FormHandle.getValues, …) are layered
 * on by these domain modules. Adding a kind's imperative surface means adding it
 * to exactly one module, not growing makeObject.
 */
import { extend, type HandleCtx } from './shared'
import { extendOverlay } from './overlay'
import { extendInputs } from './inputs'
import { extendFeedback } from './feedback'
import { extendData } from './data'

export type { HandleCtx }
export { extend }

/** Apply every domain extension for this handle's kind. */
export function extendHandle(ctx: HandleCtx): void {
  extendOverlay(ctx)
  extendInputs(ctx)
  extendFeedback(ctx)
  extendData(ctx)
}
