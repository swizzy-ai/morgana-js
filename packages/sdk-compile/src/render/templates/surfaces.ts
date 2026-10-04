/**
 * Overlay templates: accordion, dropdown, tooltip.
 *
 * All three follow the same contract as `dialog`: a trigger toggles a panel on
 * the same entity root, driven by `data-open`. Keeping one convention means the
 * imperative handles in §5 can target all of them identically.
 */
import { baseAttrs, carryProps, escAttr, escHtml, type RenderNode } from '../html';
import { iconFor, withIcon } from '../icons';
import { renderNode } from '../node';
import type { ProjectIR } from '../../ir';

export function renderAccordion(ir: ProjectIR, node: RenderNode): string {
  const props = node.props
  const attrList = baseAttrs(node)
  const multiple = props['multiple'] === true
  attrList.push(`data-multiple="${multiple ? 'true' : 'false'}"`)
  if (props['collapsible'] === false) attrList.push('data-collapsible="false"')
  const skip = new Set(['id', 'name', 'placement', 'data', 'address', 'app', 'multiple', 'collapsible', 'icon', 'iconPosition'])
  attrList.push(...carryProps(props, skip))

  let html = `<div ${attrList.join(' ')}>`
  // Each child is one item: a trigger (from the item's title) and a panel.
  for (const childId of node.children) {
    const child = ir.objects.get(childId)
    if (!child) continue
    const cp = child.props as Record<string, unknown>
    const key = String(cp['key'] ?? cp['title'] ?? cp['label'] ?? childId)
    const open = cp['defaultOpen'] === true || cp['open'] === true
    const disabled = cp['disabled'] === true
    const title = cp['title'] ?? cp['label'] ?? cp['content'] ?? ''

    html += '<div data-part="accordion-item">'
    html += `<button type="button" data-part="accordion-trigger" data-item-key="${escAttr(key)}" data-open="${open ? 'true' : 'false'}"${disabled ? ' data-disabled="true"' : ''} aria-expanded="${open ? 'true' : 'false'}">`
    html += `<span data-part="accordion-title">${escHtml(String(title))}</span>`
    html += '<span data-part="chevron">&#x2304;</span>'
    html += '</button>'
    html += `<div data-part="accordion-panel"${open ? '' : ' hidden'}>`
    // The item's own children are the panel body; its text content is a
    // convenience body for the common one-liner case.
    if (child.children.length) {
      html += child.children.map((c) => renderNode(ir, c)).join('')
    } else if (cp['content'] !== undefined && cp['content'] !== '') {
      html += escHtml(String(cp['content']))
    }
    html += '</div></div>'
  }
  html += '</div>'
  return html
}

export function renderDropdown(ir: ProjectIR, node: RenderNode): string {
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

  const triggerLabel = props['label'] ?? props['trigger'] ?? props['content']

  let html = `<div ${attrList.join(' ')}>`
  html += `<div data-part="dropdown-trigger" role="button" tabindex="0" aria-haspopup="true" aria-expanded="${props['open'] === true ? 'true' : 'false'}"${props['disabled'] === true ? ' data-disabled="true"' : ''}>`
  if (triggerLabel !== undefined && triggerLabel !== null && triggerLabel !== '') {
    html += escHtml(String(triggerLabel))
  } else {
    html += childTrigger(ir, node)
  }
  html += '</div>'

  // Panel: declared items, or the placed children.
  const items = Array.isArray(props['items']) ? (props['items'] as Array<Record<string, unknown>>) : []
  html += '<div data-part="dropdown-panel" hidden>'
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    if (item['separator'] === true) {
      html += '<div data-part="dropdown-separator"></div>'
      continue
    }
    const label = String(item['label'] ?? item['value'] ?? '')
    const value = String(item['value'] ?? label)
    const disabled = item['disabled'] === true
    const active = item['active'] === true || String(props['value'] ?? '') === value
    html += `<a data-part="dropdown-item" data-value="${escAttr(value)}" href="${item['href'] ? escAttr(String(item['href'])) : '#'}"${disabled ? ' data-disabled="true"' : ''}${active ? ' data-active="true"' : ''}>`
    html += escHtml(label)
    html += '</a>'
  }
  html += node.children.map((c) => renderNode(ir, c)).join('')
  html += '</div>'

  html += '</div>'
  return html
}

/** The first placed child acts as the trigger when no label is declared. */
function childTrigger(ir: ProjectIR, node: RenderNode): string {
  const first = node.children[0]
  if (first === undefined) return ''
  return renderNode(ir, first)
}

export function renderTooltip(ir: ProjectIR, node: RenderNode): string {
  const props = node.props
  const attrList = baseAttrs(node)
  const content = props['content'] ?? props['tip'] ?? props['label']
  const placement = typeof props['placement'] === 'string' ? props['placement'] : 'top'
  attrList.push(`data-placement="${escAttr(placement)}"`)
  attrList.push(`data-visible="${props['visible'] === true ? 'true' : 'false'}"`)
  attrList.push('aria-describedby="false"')
  const skip = new Set(['id', 'name', 'placement', 'data', 'address', 'app', 'content', 'tip', 'label', 'visible', 'icon', 'iconPosition'])
  attrList.push(...carryProps(props, skip))

  let html = `<span ${attrList.join(' ')} tabindex="0">`
  // The trigger is the placed content; the tip is the label.
  html += node.children.map((c) => renderNode(ir, c)).join('')
  if (content !== undefined && content !== null && content !== '') {
    html += `<span data-part="tip" role="tooltip">${escHtml(String(content))}</span>`
  }
  html += '</span>'
  const icon = iconFor(ir, props)
  return icon.html ? withIcon(html, icon) : html
}
