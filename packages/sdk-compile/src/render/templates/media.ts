/**
 * Media templates: image.
 */
import { baseAttrs, carryProps, escAttr, type RenderNode } from '../html';
import type { ProjectIR } from '../../ir';

export function renderImage(ir: ProjectIR, node: RenderNode): string {
  const props = node.props
  const attrList = baseAttrs(node)
  for (const k of ['src', 'alt']) {
    if (props[k] !== undefined && props[k] !== null && props[k] !== '') {
      attrList.push(`${k}="${escAttr(String(props[k]))}"`)
    }
  }
  for (const k of ['width', 'height']) {
    if (props[k] !== undefined && props[k] !== null && props[k] !== '') {
      attrList.push(`${k}="${escAttr(String(props[k]))}"`)
    }
  }
  if (typeof props['fallback'] === 'string' && props['fallback'] !== '') {
    attrList.push(`onerror="this.onerror=null;this.src='${escAttr(props['fallback']).replace(/'/g, '%27')}'"`)
  }
  const skip = new Set(['id', 'name', 'placement', 'data', 'address', 'app', 'src', 'alt', 'width', 'height', 'fallback', 'fit', 'aspectRatio', 'radius'])
  attrList.push(...carryProps(props, skip))
  void ir
  return `<img ${attrList.join(' ')} />`
}
