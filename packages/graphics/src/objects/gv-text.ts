import { createCustomObject } from '@studiomorgana/sdk'
import { mountPart } from '../runtime'
import '../kinds'

const part = mountPart('text')

/** Text, drawn as a graphics object. */
export default createCustomObject({
  name: 'gv-text',
  description: 'Text, drawn as a graphics object.',
  defaultProps: { content: '', size: 0.2, colour: '#ffffff', font: 'display', weight: 800, x: 0, y: 0, opacity: 1 },
  onMount: (el: HTMLElement, ctx: any) => part.onMount(el, ctx),
  onUpdate: (next: any, ctx: any) => part.onUpdate(next, ctx),
})
