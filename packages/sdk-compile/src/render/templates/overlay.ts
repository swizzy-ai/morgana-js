/**
 * Overlay templates: badge, alert, tabs, dialog.
 */
import { baseAttrs, carryProps, escAttr, escHtml, type RenderNode } from '../html';
import { iconFor, resolveIconToHtml, withIcon } from '../icons';
import { renderNode } from '../node';
import type { ProjectIR } from '../../ir';

export function renderBadge(ir: ProjectIR, node: RenderNode): string {
  const props = node.props
  const attrList = baseAttrs(node)
  const skip = new Set(['id', 'name', 'placement', 'data', 'address', 'app', 'label', 'icon', 'iconPosition', 'removable', 'dot'])
  attrList.push(...carryProps(props, skip))
  const label = props['label'] !== undefined && props['label'] !== null ? escHtml(String(props['label'])) : ''
  const dot = props['dot'] === true ? '<span data-part="dot" aria-hidden="true"></span>' : ''
  const remove =
    props['removable'] === true ? '<button type="button" data-part="remove" aria-label="Remove">×</button>' : ''
  const inner = withIcon(`${dot}${label}`, iconFor(ir, props))
  return `<span ${attrList.join(' ')}>${inner}${remove}</span>`
}

export function renderAlert(ir: ProjectIR, node: RenderNode): string {
  const props = node.props
  const attrList = baseAttrs(node)
  if (props['visible'] === false) attrList.push('hidden')
  const skip = new Set(['id', 'name', 'placement', 'data', 'address', 'app', 'title', 'description', 'icon', 'iconPosition', 'dismissible', 'visible', 'actionLabel'])
  attrList.push(...carryProps(props, skip))
  const icon = iconFor(ir, props)
  let inner = icon.html ?? ''
  if (props['title'] !== undefined && props['title'] !== null && props['title'] !== '') {
    inner += `<div data-part="title">${escHtml(String(props['title']))}</div>`
  }
  if (props['description'] !== undefined && props['description'] !== null && props['description'] !== '') {
    inner += `<div data-part="description">${escHtml(String(props['description']))}</div>`
  }
  if (props['actionLabel'] !== undefined && props['actionLabel'] !== null && props['actionLabel'] !== '') {
    inner += `<button type="button" data-part="action">${escHtml(String(props['actionLabel']))}</button>`
  }
  if (props['dismissible'] === true) {
    inner += '<button type="button" data-part="dismiss" aria-label="Dismiss">×</button>'
  }
  return `<div ${attrList.join(' ')}>${inner}</div>`
}

interface TabsItem {
  key: string
  label: string
  content?: unknown
  icon?: string
  badge?: string | number
  disabled?: boolean
}

export function renderTabs(ir: ProjectIR, node: RenderNode): string {
  const props = node.props
  const attrList = baseAttrs(node)
  // variant: line | pill | pills | enclosed | bordered — orientation:
  // horizontal | vertical. Both were declared but never emitted.
  const variant = typeof props['variant'] === 'string' ? props['variant'] : 'line'
  const orientation = props['orientation'] === 'vertical' ? 'vertical' : 'horizontal'
  attrList.push(`data-variant="${escAttr(variant)}"`)
  attrList.push(`data-orientation="${escAttr(orientation)}"`)
  const skip = new Set(['id', 'name', 'placement', 'data', 'address', 'app', 'items', 'activeKey', 'variant', 'orientation'])
  attrList.push(...carryProps(props, skip))
  const items: TabsItem[] = Array.isArray(props['items']) ? (props['items'] as TabsItem[]) : []
  const activeKey = typeof props['activeKey'] === 'string' && items.some((t) => t.key === props['activeKey'])
    ? String(props['activeKey'])
    : items[0]?.key
  let html = `<div ${attrList.join(' ')}><div data-part="tab-list" role="tablist">`
  for (const item of items) {
    const active = item.key === activeKey ? ' data-active="true"' : ''
    const disabled = item.disabled ? ' data-disabled="true" aria-disabled="true"' : ''
    const icon = typeof item.icon === 'string' && item.icon !== '' ? resolveIconToHtml(item.icon, ir) : ''
    const badge = item.badge !== undefined && item.badge !== null && item.badge !== '' ? `<span data-part="tab-badge">${escHtml(String(item.badge))}</span>` : ''
    html += `<div data-part="tab" data-tab-key="${escAttr(String(item.key))}" role="tab"${active}${disabled}>${icon}${escHtml(String(item.label ?? item.key))}${badge}</div>`
  }
  html += '</div>'
  for (const item of items) {
    const hidden = item.key === activeKey ? '' : ' hidden'
    const content = typeof item.content === 'string' ? escHtml(item.content) : ''
    html += `<div data-part="panel" data-panel-key="${escAttr(String(item.key))}" role="tabpanel"${hidden}>${content}</div>`
  }
  html += '</div>'
  return html
}

export function renderDialog(ir: ProjectIR, node: RenderNode): string {
  const props = node.props
  const attrList = baseAttrs(node)
  const open = props['open'] === true
  if (!open) attrList.push('style="display:none"')
  attrList.push('role="dialog" aria-modal="true"')
  const skip = new Set(['id', 'name', 'placement', 'data', 'address', 'app', 'open', 'title', 'description', 'showFooter', 'confirmLabel', 'cancelLabel', 'dismissible'])
  attrList.push(...carryProps(props, skip))
  const dismissible = props['dismissible'] !== false
  let html = `<div ${attrList.join(' ')}>`
  html += `<div data-part="overlay"${dismissible ? ' data-close="true"' : ''}></div>`
  html += '<div data-part="content">'
  const icon = iconFor(ir, props)
  if (icon.html) html += icon.html
  if (props['title'] !== undefined && props['title'] !== null && props['title'] !== '') {
    html += `<div data-part="header">${escHtml(String(props['title']))}</div>`
  }
  if (props['description'] !== undefined && props['description'] !== null && props['description'] !== '') {
    html += `<div data-part="description">${escHtml(String(props['description']))}</div>`
  }
  html += node.children.map((c) => renderNode(ir, c)).join('')
  const showFooter = props['showFooter'] === true || props['confirmLabel'] !== undefined || props['cancelLabel'] !== undefined
  if (showFooter) {
    const cancel = props['cancelLabel'] !== undefined && props['cancelLabel'] !== null ? String(props['cancelLabel']) : 'Cancel'
    const confirm = props['confirmLabel'] !== undefined && props['confirmLabel'] !== null ? String(props['confirmLabel']) : 'Confirm'
    html += `<div data-part="footer"><button type="button" data-part="cancel">${escHtml(cancel)}</button><button type="button" data-part="confirm">${escHtml(confirm)}</button></div>`
  }
  if (dismissible) html += '<button type="button" data-part="dismiss" aria-label="Close">×</button>'
  html += '</div></div>'
  return html
}
