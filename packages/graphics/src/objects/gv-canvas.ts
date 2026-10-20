import { createCustomObject } from '@studiomorgana/sdk'
import { clockMethods, mountCanvas } from '../runtime'
import '../kinds'

/** Where a graphic is shown on a page: owns the renderer, the clock and the performance meter. */
export default createCustomObject({
  name: 'gv-canvas',
  description: 'Shows the graphics and game objects placed in it. 2D or 3D; plays a clock of `length` seconds; stats: false hides the meter.',
  defaultProps: { size: '16:9', mode: '3d', length: 0, loop: true, plays: true, background: '', stats: true },
  onMount: (el: HTMLElement, ctx: any) => mountCanvas(el, ctx),
  methods: clockMethods,
})
