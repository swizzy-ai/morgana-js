import { createCustomObject } from '@studiomorgana/sdk'
import { mountPart } from '../runtime'
import '../kinds'

const part = mountPart('light')

/** A light: sun or ambient. */
export default createCustomObject({
  name: 'gv-light',
  description: 'A light: sun or ambient.',
  defaultProps: { kind: 'sun', height: 35, strength: 2.2, colour: '#fff4e0' },
  onMount: (el: HTMLElement, ctx: any) => part.onMount(el, ctx),
  onUpdate: (next: any, ctx: any) => part.onUpdate(next, ctx),
})
