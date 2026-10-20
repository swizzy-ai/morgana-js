import { createCustomObject } from '@studiomorgana/sdk'
import { mountPart } from '../runtime'
import '../kinds'

const part = mountPart('shape')

/** A 2D shape: circle, ring or rect (w, h). */
export default createCustomObject({
  name: 'gv-shape',
  description: 'A 2D shape: circle, ring or rect (w, h).',
  defaultProps: { shape: 'circle', size: 0.5, colour: '#ffffff', x: 0, y: 0, opacity: 1 },
  onMount: (el: HTMLElement, ctx: any) => part.onMount(el, ctx),
  onUpdate: (next: any, ctx: any) => part.onUpdate(next, ctx),
})
