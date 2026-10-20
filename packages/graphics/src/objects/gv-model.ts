import { createCustomObject } from '@studiomorgana/sdk'
import { mountPart } from '../runtime'
import '../kinds'

const part = mountPart('model')

/** A 3D model: box, sphere, plane, cylinder. */
export default createCustomObject({
  name: 'gv-model',
  description: 'A 3D model: box, sphere, plane, cylinder.',
  defaultProps: { shape: 'box', size: [1, 1, 1], colour: '#cccccc', x: 0, y: 0, z: 0 },
  onMount: (el: HTMLElement, ctx: any) => part.onMount(el, ctx),
  onUpdate: (next: any, ctx: any) => part.onUpdate(next, ctx),
})
