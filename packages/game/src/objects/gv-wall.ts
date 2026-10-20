import { createCustomObject } from '@studiomorgana/sdk'
import { mountPart } from '@studiomorgana/graphics'
import '../kinds'

const part = mountPart('wall')

/** A fixed body the player cannot walk through. */
export default createCustomObject({
  name: 'gv-wall',
  description: 'A fixed body the player cannot walk through.',
  defaultProps: { size: [1, 2, 1], colour: '#c9b79c', x: 0, z: 0 },
  onMount: (el: HTMLElement, ctx: any) => part.onMount(el, ctx),
  onUpdate: (next: any, ctx: any) => part.onUpdate(next, ctx),
})
