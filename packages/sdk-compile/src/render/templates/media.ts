/**
 * Media templates: image.
 */
import { baseAttrs, carryProps, escAttr, type RenderNode } from '../html';
import type { ProjectIR } from '../../ir';

/** A plain positive integer (the only kind of HTML intrinsic dimension), else null. */
function intrinsicSize(value: unknown): string | null {
  if (typeof value === 'number') return Number.isInteger(value) && value > 0 ? String(value) : null
  if (typeof value === 'string') {
    const t = value.trim()
    return /^\d+$/.test(t) && Number(t) > 0 ? t : null
  }
  return null
}

export function renderImage(ir: ProjectIR, node: RenderNode): string {
  const props = node.props
  const attrList = baseAttrs(node)
  for (const k of ['src', 'alt']) {
    if (props[k] !== undefined && props[k] !== null && props[k] !== '') {
      attrList.push(`${k}="${escAttr(String(props[k]))}"`)
    }
  }
  // `width`/`height` on an image are layout dims — a measure, `stretch`, a
  // percentage — which the stylesheet applies. Only a plain integer is a valid
  // HTML intrinsic dimension that reserves space before load; emitting a token
  // as `width="stretch"` was invalid and reserved nothing.
  for (const k of ['width', 'height']) {
    const size = intrinsicSize(props[k])
    if (size !== null) attrList.push(`${k}="${size}"`)
  }
  if (typeof props['fallback'] === 'string' && props['fallback'] !== '') {
    attrList.push(`onerror="this.onerror=null;this.src='${escAttr(props['fallback']).replace(/'/g, '%27')}'"`)
  }
  // Offscreen images load lazily by default; the hero opts in with `priority`.
  const priority = props['priority'] === true
  attrList.push(`loading="${priority ? 'eager' : 'lazy'}"`)
  const decoding = props['decoding'] === 'sync' ? 'sync' : props['decoding'] === 'auto' ? 'auto' : 'async'
  attrList.push(`decoding="${decoding}"`)
  const fetchpriority = priority ? 'high' : props['fetchpriority']
  if (fetchpriority === 'high' || fetchpriority === 'low' || fetchpriority === 'auto') {
    attrList.push(`fetchpriority="${fetchpriority}"`)
  }
  for (const k of ['srcset', 'sizes']) {
    if (typeof props[k] === 'string' && props[k] !== '') attrList.push(`${k}="${escAttr(props[k])}"`)
  }
  const skip = new Set([
    'id', 'name', 'placement', 'data', 'address', 'app',
    'src', 'alt', 'width', 'height', 'fallback', 'fit', 'aspectRatio', 'radius',
    'priority', 'srcset', 'sizes', 'decoding', 'fetchpriority',
  ])
  attrList.push(...carryProps(props, skip))
  void ir
  return `<img ${attrList.join(' ')} />`
}
