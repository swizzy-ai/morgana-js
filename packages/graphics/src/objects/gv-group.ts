import { createCustomObject } from '@studiomorgana/sdk'
import { mountPart } from '../runtime'
import '../kinds'

const part = mountPart('group')

/** Holds other graphics objects and moves them together. */
export default createCustomObject({
  name: 'gv-group',
  description: 'Holds other graphics objects and moves them together.',
  defaultProps: { x: 0, y: 0, z: 0, turn: 0, scale: 1 },
  onMount: (el: HTMLElement, ctx: any) => part.onMount(el, ctx),
  onUpdate: (next: any, ctx: any) => part.onUpdate(next, ctx),
})
