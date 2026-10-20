import { createCustomObject } from '@studiomorgana/sdk'
import { mountPart } from '@studiomorgana/graphics'
import '../kinds'

const part = mountPart('grass')

/** A field of grass that sways in the wind and bends around players. */
export default createCustomObject({
  name: 'gv-grass',
  description: 'A field of grass that sways in the wind and bends around players.',
  defaultProps: { area: [30, 30], density: 0.6, wind: 0.4, colour: '#3f7d2f', tip: '#b6d96a' },
  onMount: (el: HTMLElement, ctx: any) => part.onMount(el, ctx),
  onUpdate: (next: any, ctx: any) => part.onUpdate(next, ctx),
})
