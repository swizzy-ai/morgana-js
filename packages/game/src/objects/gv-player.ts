import { createCustomObject } from '@studiomorgana/sdk'
import { mountPart } from '@studiomorgana/graphics'
import '../kinds'

const part = mountPart('player')

/** A body driven by the keyboard (WASD or arrows). Emits hit when it touches a wall. */
export default createCustomObject({
  name: 'gv-player',
  description: 'A body driven by the keyboard (WASD or arrows). Emits hit when it touches a wall.',
  defaultProps: { speed: 5, colour: '#e8553f', x: 0, z: 0, controls: 'wasd' },
  events: ['hit'] as const,
  onMount: (el: HTMLElement, ctx: any) => part.onMount(el, ctx),
  onUpdate: (next: any, ctx: any) => part.onUpdate(next, ctx),
})
