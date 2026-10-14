/**
 * Navigation + leaf primitive templates: menu, breadcrumbs, avatar, separator,
 * skeleton, slot.
 */
import { baseAttrs, carryProps, escAttr, escHtml, type RenderNode } from '../html';
import { iconFor, withIcon } from '../icons';
import { renderNode } from '../node';
import type { ProjectIR } from '../../ir';

/** Menu is a dropdown that lays out horizontally — same contract, different CSS. */
export function renderMenu(ir: ProjectIR, node: RenderNode): string {
  // Reuse the dropdown renderer: identical DOM, the kind drives the styling.
  return renderDropdownLike(ir, node, 'menu')
}

function renderDropdownLike(ir: ProjectIR, node: RenderNode, kind: 'menu' | 'dropdown'): string {
  const props = node.props
  const attrList = baseAttrs(node)
  attrList.push(`data-open="${props['open'] === true ? 'true' : 'false'}"`)
  attrList.push(`data-close-on-select="${props['closeOnSelect'] === false ? 'false' : 'true'}"`)
  if (props['placement'] !== undefined) attrList.push(`data-placement="${escAttr(String(props['placement']))}"`)
  const skip = new Set([
    'id', 'name', 'placement', 'data', 'address', 'app',
    'open', 'closeOnSelect', 'items', 'value', 'icon', 'iconPosition',
  ])
  attrList.push(...carryProps(props, skip))
  void kind

  const triggerLabel = props['label'] ?? props['trigger']
  let html = `<div ${attrList.join(' ')}>`
  if (triggerLabel !== undefined && triggerLabel !== null && triggerLabel !== '') {
    html += `<div data-part="dropdown-trigger" role="button" tabindex="0" aria-haspopup="true">${escHtml(String(triggerLabel))}</div>`
  }
  html += '<div data-part="dropdown-panel" hidden>'
  const items = Array.isArray(props['items']) ? (props['items'] as Array<Record<string, unknown>>) : []
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    if (item['separator'] === true) {
      html += '<div data-part="dropdown-separator"></div>'
      continue
    }
    const label = String(item['label'] ?? item['value'] ?? '')
    const value = String(item['value'] ?? label)
    const active = item['active'] === true || String(props['value'] ?? '') === value
    html += `<a data-part="dropdown-item" data-value="${escAttr(value)}" href="${item['href'] ? escAttr(String(item['href'])) : '#'}"${item['disabled'] === true ? ' data-disabled="true"' : ''}${active ? ' data-active="true"' : ''}>${escHtml(label)}</a>`
  }
  html += node.children.map((c) => renderNode(ir, c)).join('')
  html += '</div></div>'
  return html
}

export function renderBreadcrumbs(ir: ProjectIR, node: RenderNode): string {
  const props = node.props
  const attrList = baseAttrs(node)
  const separator = typeof props['separator'] === 'string' ? props['separator'] : '/'
  attrList.push(`data-separator="${escAttr(separator)}"`)
  const skip = new Set(['id', 'name', 'placement', 'data', 'address', 'app', 'items', 'separator', 'icon', 'iconPosition'])
  attrList.push(...carryProps(props, skip))

  let html = `<nav ${attrList.join(' ')} aria-label="Breadcrumb">`
  const items = Array.isArray(props['items']) ? (props['items'] as Array<Record<string, unknown>>) : []
  let first = true
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    if (!first) html += `<span data-part="separator" aria-hidden="true">${escHtml(separator)}</span>`
    first = false
    const label = String(item['label'] ?? item['value'] ?? '')
    // The last crumb is the current page and must not be a link — the client
    // enforces this too, but a statically-correct crumb is better.
    const isLast = item === items[items.length - 1]
    const href = isLast ? undefined : item['href']
    html += '<span data-part="crumb" data-current="false">'
    html += href
      ? `<a href="${escAttr(String(href))}">${escHtml(label)}</a>`
      : `<span>${escHtml(label)}</span>`
    html += '</span>'
  }
  html += node.children.map((c) => renderNode(ir, c)).join('')
  html += '</nav>'
  return html
}

const AVATAR_SIZES: Record<string, number> = { xs: 20, sm: 28, md: 36, lg: 48, xl: 64 }

export function renderAvatar(ir: ProjectIR, node: RenderNode): string {
  const props = node.props
  const attrList = baseAttrs(node)
  attrList.push(`data-size="${escAttr(String(props['size'] ?? 'md'))}"`)
  if (props['ring'] === true) attrList.push('data-ring="true"')
  const skip = new Set(['id', 'name', 'placement', 'data', 'address', 'app', 'src', 'alt', 'name_', 'initials', 'status', 'size', 'shape', 'ring', 'icon', 'iconPosition'])
  attrList.push(...carryProps(props, skip))

  const size = typeof props['size'] === 'string' ? props['size'] : 'md'
  const px = AVATAR_SIZES[size] ?? AVATAR_SIZES['md']!
  const src = typeof props['src'] === 'string' ? props['src'] : ''
  const alt = typeof props['alt'] === 'string' ? props['alt'] : String(props['name'] ?? '')
  const declared = typeof props['initials'] === 'string' ? props['initials'] : ''

  // Initials are derived from the name when not declared, so the box is never
  // empty while a remote image loads or after it fails.
  const initials = declared || deriveInitials(String(props['name'] ?? alt ?? ''))

  let html = `<span ${attrList.join(' ')}>`
  if (src !== '') {
    html += `<img data-part="image" src="${escAttr(src)}" alt="${escAttr(alt)}" width="${px}" height="${px}" loading="lazy" />`
  }
  html += `<span data-part="initials" aria-hidden="${src !== '' ? 'true' : 'false'}">${escHtml(initials)}</span>`
  if (props['status']) {
    const status = String(props['status'])
    html += `<span data-part="status" data-status="${escAttr(status)}" title="${escAttr(status)}"></span>`
  }
  html += '</span>'
  const icon = iconFor(ir, props)
  return icon.html ? withIcon(html, icon) : html
}

function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return ''
  if (parts.length === 1) return parts[0]!.slice(0, 2)
  return (parts[0]![0]! + parts[parts.length - 1]![0]!)
}

export function renderSeparator(ir: ProjectIR, node: RenderNode): string {
  void ir
  const props = node.props
  const attrList = baseAttrs(node)
  attrList.push(`data-variant="${escAttr(String(props['variant'] ?? 'solid'))}"`)
  const skip = new Set(['id', 'name', 'placement', 'data', 'address', 'app', 'orientation', 'variant', 'icon', 'iconPosition'])
  attrList.push(...carryProps(props, skip))
  return `<div ${attrList.join(' ')}></div>`
}

export function renderSkeleton(ir: ProjectIR, node: RenderNode): string {
  const props = node.props
  const attrList = baseAttrs(node)
  if (props['animate'] === false) attrList.push('data-animate="false"')
  const skip = new Set(['id', 'name', 'placement', 'data', 'address', 'app', 'width', 'height', 'radius', 'animate', 'icon', 'iconPosition'])
  attrList.push(...carryProps(props, skip))
  let html = `<div ${attrList.join(' ')}`
  // data-width/height/radius also become inline style — CSS cannot read data
  // attributes into box dimensions, so without this every skeleton is 0×0.
  const dim = (v: unknown): string | null => {
    if (v === undefined || v === null || v === '') return null
    if (typeof v === 'number') return `${v * 4}px`
    return String(v)
  }
  const sw = dim(props['width'])
  const sh = dim(props['height'])
  const sr = dim(props['radius'])
  if (sw || sh || sr) {
    html += ` style="${[sw ? `width:${sw}` : '', sh ? `height:${sh}` : '', sr ? `border-radius:${sr}` : ''].filter(Boolean).join(';')}"`
  }
  if (props['width'] !== undefined) html += ` data-width="${escAttr(String(props['width']))}"`
  if (props['height'] !== undefined) html += ` data-height="${escAttr(String(props['height']))}"`
  if (props['radius'] !== undefined) html += ` data-radius="${escAttr(String(props['radius']))}"`
  html += ` aria-hidden="true"></div>`
  void ir
  return html
}

export function renderSlot(ir: ProjectIR, node: RenderNode): string {
  const props = node.props
  const attrList = baseAttrs(node)
  const skip = new Set(['id', 'name', 'placement', 'data', 'address', 'app', 'fallback', 'icon', 'iconPosition'])
  attrList.push(...carryProps(props, skip))
  const inner = node.children.map((c) => renderNode(ir, c)).join('')
  // A slot with a declared fallback shows it while empty, then the client
  // removes it on first projection.
  if (inner === '' && props['fallback'] !== undefined && props['fallback'] !== '') {
    return `<div ${attrList.join(' ')}><div data-part="fallback">${escHtml(String(props['fallback']))}</div></div>`
  }
  return `<div ${attrList.join(' ')}>${inner}</div>`
}

export function renderBlockquote(ir: ProjectIR, node: RenderNode): string {
  const props = node.props
  void ir
  const attrList = baseAttrs(node)
  const skip = new Set(['id', 'name', 'placement', 'data', 'address', 'app', 'content', 'text', 'cite'])
  attrList.push(...carryProps(props, skip))
  const body = String(props['content'] ?? props['text'] ?? '')
  let html = `<blockquote ${attrList.join(' ')}>`
  html += `<div data-part="quote">${escHtml(body)}</div>`
  if (props['cite'] !== undefined && props['cite'] !== '') {
    html += `<cite data-part="cite">— ${escHtml(String(props['cite']))}</cite>`
  }
  html += node.children.map((c) => renderNode(ir, c)).join('')
  html += '</blockquote>'
  return html
}

export function renderKbd(ir: ProjectIR, node: RenderNode): string {
  const props = node.props
  void ir
  const attrList = baseAttrs(node)
  const skip = new Set(['id', 'name', 'placement', 'data', 'address', 'app', 'content', 'keys', 'size'])
  attrList.push(...carryProps(props, skip))
  const keys = Array.isArray(props['keys'])
    ? (props['keys'] as unknown[]).map((k) => String(k))
    : String(props['content'] ?? '').split('+').map((k) => k.trim()).filter((k) => k !== '')

  let html = `<span ${attrList.join(' ')}>`
  html += keys.map((k) => `<kbd data-part="key">${escHtml(k)}</kbd>`).join('<span data-part="plus">+</span>')
  html += '</span>'
  return html
}

export function renderStatus(ir: ProjectIR, node: RenderNode): string {
  const props = node.props
  void ir
  const attrList = baseAttrs(node)
  const value = typeof props['value'] === 'string' ? props['value'] : 'neutral'
  attrList.push(`data-status="${escAttr(value)}"`)
  const skip = new Set(['id', 'name', 'placement', 'data', 'address', 'app', 'label', 'value', 'size'])
  attrList.push(...carryProps(props, skip))

  let html = `<span ${attrList.join(' ')}>`
  html += '<span data-part="dot" aria-hidden="true"></span>'
  if (props['label'] !== undefined && props['label'] !== '') {
    html += `<span data-part="status-label">${escHtml(String(props['label']))}</span>`
  }
  html += '</span>'
  return html
}

export function renderSpinner(ir: ProjectIR, node: RenderNode): string {
  const props = node.props
  void ir
  const attrList = baseAttrs(node)
  attrList.push('role="status"')
  const skip = new Set(['id', 'name', 'placement', 'data', 'address', 'app', 'label', 'size'])
  attrList.push(...carryProps(props, skip))

  let html = `<span ${attrList.join(' ')}>`
  html += '<span data-part="track" aria-hidden="true"></span>'
  if (props['label'] !== undefined && props['label'] !== '') {
    html += `<span data-part="spinner-label">${escHtml(String(props['label']))}</span>`
  } else {
    html += '<span data-part="spinner-label" hidden>Loading</span>'
  }
  html += '</span>'
  return html
}

export function renderEmptyState(ir: ProjectIR, node: RenderNode): string {
  const props = node.props
  void ir
  const attrList = baseAttrs(node)
  const skip = new Set(['id', 'name', 'placement', 'data', 'address', 'app', 'title', 'description', 'icon'])
  attrList.push(...carryProps(props, skip))

  let html = `<div ${attrList.join(' ')}>`
  if (props['icon'] !== undefined && props['icon'] !== '') {
    html += `<div data-part="empty-icon">${escHtml(String(props['icon']))}</div>`
  }
  if (props['title'] !== undefined && props['title'] !== '') {
    html += `<div data-part="empty-title">${escHtml(String(props['title']))}</div>`
  }
  if (props['description'] !== undefined && props['description'] !== '') {
    html += `<div data-part="empty-description">${escHtml(String(props['description']))}</div>`
  }
  html += node.children.map((c) => renderNode(ir, c)).join('')
  html += '</div>'
  return html
}

export function renderAspectRatio(ir: ProjectIR, node: RenderNode): string {
  const props = node.props
  void ir
  const attrList = baseAttrs(node)
  const ratio = typeof props['ratio'] === 'string' && props['ratio'] !== '' ? props['ratio'] : '16/9'
  attrList.push(`data-ratio="${escAttr(ratio)}"`)
  attrList.push(`style="aspect-ratio:${escAttr(ratio)}"`)
  const skip = new Set(['id', 'name', 'placement', 'data', 'address', 'app', 'ratio'])
  attrList.push(...carryProps(props, skip))

  let html = `<div ${attrList.join(' ')}>`
  html += node.children.map((c) => renderNode(ir, c)).join('')
  html += '</div>'
  return html
}

export function renderAvatarGroup(ir: ProjectIR, node: RenderNode): string {
  const props = node.props
  void ir
  const attrList = baseAttrs(node)
  const skip = new Set(['id', 'name', 'placement', 'data', 'address', 'app', 'avatars', 'max', 'size'])
  attrList.push(...carryProps(props, skip))
  const avatars = Array.isArray(props['avatars']) ? (props['avatars'] as Array<Record<string, unknown>>) : []
  const max = Number(props['max'] ?? 0)
  const shown = max > 0 ? avatars.slice(0, Math.floor(max)) : avatars
  const rest = avatars.length - shown.length

  const member = (a: Record<string, unknown>): string => {
    const name = String(a?.['name'] ?? '')
    const src = typeof a?.['src'] === 'string' ? a['src'] as string : ''
    const initials = name.trim().split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2)
    return (
      `<span data-part="member" title="${escAttr(name)}">` +
      (src !== '' ? `<img data-part="image" src="${escAttr(src)}" alt="${escAttr(name)}" />` : `<span data-part="initials">${escHtml(initials)}</span>`) +
      '</span>'
    )
  }
  let html = `<div ${attrList.join(' ')}>`
  html += shown.map(member).join('')
  if (rest > 0) html += `<span data-part="overflow">+${rest}</span>`
  html += '</div>'
  return html
}
