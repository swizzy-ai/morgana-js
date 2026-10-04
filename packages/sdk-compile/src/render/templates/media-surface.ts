/**
 * Media templates: video, audio.
 */
import { baseAttrs, carryProps, escAttr, type RenderNode } from '../html';
import type { ProjectIR } from '../../ir';

export function renderVideo(ir: ProjectIR, node: RenderNode): string {
  void ir
  const props = node.props
  const attrList = baseAttrs(node)
  attrList.push(`data-variant="${escAttr(String(props['variant'] ?? 'default'))}"`)
  attrList.push(`data-autoplay="${props['autoPlay'] === true ? 'true' : 'false'}"`)
  const skip = new Set([
    'id', 'name', 'placement', 'data', 'address', 'app',
    'src', 'poster', 'controls', 'autoPlay', 'loop', 'muted', 'playsInline', 'variant',
  ])
  attrList.push(...carryProps(props, skip))

  const attrs = ['data-part="media"']
  if (typeof props['src'] === 'string' && props['src'] !== '') attrs.push(`src="${escAttr(props['src'])}"`)
  if (typeof props['poster'] === 'string' && props['poster'] !== '') attrs.push(`poster="${escAttr(props['poster'])}"`)
  attrs.push(props['controls'] === false ? '' : 'controls')
  if (props['autoPlay'] === true) attrs.push('autoplay')
  if (props['loop'] === true) attrs.push('loop')
  if (props['muted'] === true) attrs.push('muted')
  attrs.push('playsinline')

  return `<video ${attrList.join(' ')} ${attrs.filter(Boolean).join(' ')}></video>`
}

export function renderAudio(ir: ProjectIR, node: RenderNode): string {
  void ir
  const props = node.props
  const attrList = baseAttrs(node)
  attrList.push(`data-variant="${escAttr(String(props['variant'] ?? 'default'))}"`)
  const skip = new Set([
    'id', 'name', 'placement', 'data', 'address', 'app',
    'src', 'controls', 'autoPlay', 'loop', 'muted', 'variant',
  ])
  attrList.push(...carryProps(props, skip))

  const attrs = ['data-part="media"']
  if (typeof props['src'] === 'string' && props['src'] !== '') attrs.push(`src="${escAttr(props['src'])}"`)
  attrs.push(props['controls'] === false ? '' : 'controls')
  if (props['autoPlay'] === true) attrs.push('autoplay')
  if (props['loop'] === true) attrs.push('loop')
  if (props['muted'] === true) attrs.push('muted')

  return `<audio ${attrList.join(' ')} ${attrs.filter(Boolean).join(' ')}></audio>`
}
