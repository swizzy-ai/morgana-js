/**
 * Form templates: button, field, select, toggle.
 */
import { baseAttrs, carryProps, escAttr, escHtml, type RenderNode } from '../html';
import { iconFor, withIcon } from '../icons';
import { renderNode } from '../node';
import type { ProjectIR } from '../../ir';

export function renderButton(ir: ProjectIR, node: RenderNode): string {
  const props = node.props
  const attrList = baseAttrs(node)
  if (props['type'] === 'button' || props['type'] === 'submit') {
    attrList.push(`type="${escAttr(String(props['type']))}"`)
  }
  if (props['disabled'] === true) attrList.push('disabled')
  if (typeof props['provider'] === 'string' && props['provider'] !== '') {
    attrList.push(`data-provider="${escAttr(String(props['provider']))}"`)
  }
  if (typeof props['openDialog'] === 'string' && props['openDialog'] !== '') {
    attrList.push(`data-open-dialog="${escAttr(String(props['openDialog']))}"`)
  }
  const skip = new Set(['id', 'name', 'placement', 'data', 'address', 'app', 'content', 'label', 'text', 'icon', 'iconPosition', 'type', 'disabled', 'provider', 'openDialog'])
  attrList.push(...carryProps(props, skip))
  const rawLabel = props['content'] ?? props['label'] ?? props['text']
  const labelHtml = rawLabel !== undefined && rawLabel !== null
    ? escHtml(String(rawLabel))
    : node.children.map((c) => renderNode(ir, c)).join('')
  const inner = withIcon(labelHtml, iconFor(ir, props))
  return `<button ${attrList.join(' ')}>${inner}</button>`
}

export function renderField(ir: ProjectIR, node: RenderNode): string {
  const props = node.props
  const isTextarea = node.kind === 'textarea'
  const attrs: string[] = []
  for (const k of ['type', 'name', 'placeholder', 'min', 'max', 'step']) {
    if (props[k] !== undefined && props[k] !== null && props[k] !== '') {
      attrs.push(`${k}="${escAttr(String(props[k]))}"`)
    }
  }
  if (props['disabled'] === true) attrs.push('disabled')
  if (typeof props['error'] === 'string' && props['error'] !== '') attrs.push('aria-invalid="true"')
  const skip = new Set(['id', 'name', 'placement', 'data', 'address', 'app', 'value', 'type', 'placeholder', 'min', 'max', 'step', 'disabled', 'error', 'icon', 'iconPosition'])
  const carried = carryProps(props, skip)
  const value = props['value'] !== undefined && props['value'] !== null ? String(props['value']) : ''

  const icon = iconFor(ir, props)
  const describedBy = typeof props['error'] === 'string' && props['error'] !== '' ? ` aria-describedby="err-${escAttr(node.id)}"` : ''
  // Entity identity stays on the field itself (bindings + CSS target it);
  // the wrapper is a plain box for icon/error adornments.
  const fieldAttrs = [...baseAttrs(node), ...attrs, ...carried]
  const field = isTextarea
    ? `<textarea ${fieldAttrs.join(' ')}${describedBy}>${escHtml(value)}</textarea>`
    : `<input ${fieldAttrs.join(' ')}${value !== '' ? ` value="${escAttr(value)}"` : ''}${describedBy} />`
  const errorHtml =
    typeof props['error'] === 'string' && props['error'] !== ''
      ? `<div data-part="error" id="err-${escAttr(node.id)}" role="alert">${escHtml(props['error'])}</div>`
      : ''
  if (!icon.html && !errorHtml) return field
  return `<div data-kind="${escAttr(node.kind)}-wrap">${icon.html ?? ''}${field}${errorHtml}</div>`
}

interface SelectOption {
  label: string
  value: string
  icon?: string
  description?: string
  disabled?: boolean
  badge?: string
}

export function renderSelect(ir: ProjectIR, node: RenderNode): string {
  const props = node.props
  const searchable = props['searchable'] === true
  const clearable = props['clearable'] === true
  const variant = typeof props['variant'] === 'string' ? props['variant'] : 'default'

  const selected = new Set(
    Array.isArray(props['value']) ? props['value'].map(String) : props['value'] !== undefined && props['value'] !== null && props['value'] !== '' ? [String(props['value'])] : [],
  )
  const options = Array.isArray(props['options']) ? (props['options'] as SelectOption[]) : []

  // A searchable or clearable select is composed: a control button plus a
  // panel, because neither is expressible on a native <select>. A plain
  // select stays native so form submission and keyboard work untouched.
  if (searchable || clearable) {
    return renderSelectComposite(ir, node, { options, selected, searchable, clearable, variant })
  }

  const attrList = baseAttrs(node)
  attrList.push(`data-variant="${escAttr(variant)}"`)
  // isOpen is declared on SelectProps; on a native select it cannot force the
  // OS dropdown open, so it is carried as state for the composed form and for
  // tests/styles to read rather than silently dropped.
  attrList.push(`data-open="${props['isOpen'] === true ? 'true' : 'false'}"`)
  if (typeof props['name'] === 'string' && props['name'] !== '') attrList.push(`name="${escAttr(props['name'])}"`)
  if (props['multiple'] === true) attrList.push('multiple')
  if (props['disabled'] === true) attrList.push('disabled')
  const skip = new Set([
    'id', 'name', 'placement', 'data', 'address', 'app', 'options', 'value', 'placeholder',
    'multiple', 'disabled', 'searchable', 'clearable', 'variant', 'isOpen', 'icon', 'iconPosition',
  ])
  attrList.push(...carryProps(props, skip))

  let inner = ''
  if (typeof props['placeholder'] === 'string' && props['placeholder'] !== '' && props['multiple'] !== true && selected.size === 0) {
    inner += `<option value="" disabled selected>${escHtml(props['placeholder'])}</option>`
  }
  for (const opt of options) {
    if (!opt || typeof opt !== 'object') continue
    const val = String(opt.value ?? opt.label ?? '')
    const sel = selected.has(val) ? ' selected' : ''
    const dis = opt.disabled ? ' disabled' : ''
    inner += `<option value="${escAttr(val)}"${sel}${dis}>${escHtml(String(opt.label ?? val))}</option>`
  }
  const icon = iconFor(ir, props)
  return `<select ${attrList.join(' ')}>${withIcon(inner, icon)}</select>`
}

/** Composed select: search input and/or clear affordance around a native list. */
function renderSelectComposite(
  ir: ProjectIR,
  node: RenderNode,
  o: {
    options: SelectOption[]
    selected: Set<string>
    searchable: boolean
    clearable: boolean
    variant: string
  },
): string {
  void ir
  const props = node.props
  const attrList = baseAttrs(node)
  attrList.push(`data-kind="${escAttr(node.kind)}"`)
  attrList.push(`data-variant="${escAttr(o.variant)}"`)
  attrList.push(`data-open="${props['isOpen'] === true ? 'true' : 'false'}"`)
  if (o.searchable) attrList.push('data-searchable="true"')
  if (o.clearable) attrList.push('data-clearable="true"')
  if (props['disabled'] === true) attrList.push('data-disabled="true"')
  if (typeof props['name'] === 'string' && props['name'] !== '') attrList.push(`data-name="${escAttr(props['name'])}"`)
  const skip = new Set([
    'id', 'name', 'placement', 'data', 'address', 'app', 'options', 'value', 'placeholder',
    'multiple', 'disabled', 'searchable', 'clearable', 'variant', 'isOpen', 'icon', 'iconPosition',
  ])
  attrList.push(...carryProps(props, skip))

  // The current value(s) shown on the control.
  const labels = o.options
    .filter((opt) => opt && o.selected.has(String(opt.value ?? opt.label ?? '')))
    .map((opt) => String(opt.label ?? opt.value ?? ''))
  const shown =
    labels.length > 0
      ? labels.join(', ')
      : typeof props['placeholder'] === 'string' && props['placeholder'] !== ''
        ? String(props['placeholder'])
        : 'Select…'

  let html = `<div ${attrList.join(' ')}>`
  html += '<div data-part="control" data-part-trigger="true" role="combobox" aria-haspopup="listbox" tabindex="0">'
  html += `<span data-part="value">${escHtml(shown)}</span>`
  if (o.clearable && labels.length) {
    html += '<span data-part="clear" role="button" aria-label="Clear">×</span>'
  }
  html += '<span data-part="caret">▾</span>'
  html += '</div>'
  if (o.searchable) {
    html += `<input data-part="search" type="text" placeholder="Search…" aria-label="Search options" />`
  }
  html += '<div data-part="options" role="listbox" hidden>'
  for (const opt of o.options) {
    if (!opt || typeof opt !== 'object') continue
    const val = String(opt.value ?? opt.label ?? '')
    const isSel = o.selected.has(val)
    html += `<div data-part="option" data-value="${escAttr(val)}" role="option" aria-selected="${isSel ? 'true' : 'false'}"${opt.disabled ? ' data-disabled="true"' : ''}>`
    html += `<span data-part="option-label">${escHtml(String(opt.label ?? val))}</span>`
    if (opt.description) html += `<span data-part="option-desc">${escHtml(String(opt.description))}</span>`
    if (opt.badge) html += `<span data-part="option-badge">${escHtml(String(opt.badge))}</span>`
    html += '</div>'
  }
  html += '</div></div>'
  return html
}

export function renderToggle(ir: ProjectIR, node: RenderNode): string {
  const props = node.props
  void ir
  const kindProp = typeof props['kind'] === 'string' ? props['kind'] : node.kind === 'checkbox' || node.kind === 'radio' ? node.kind : 'switch'
  const attrList = baseAttrs(node)
  const skip = new Set(['id', 'name', 'placement', 'data', 'address', 'app', 'checked', 'label', 'description', 'disabled', 'size', 'kind'])
  attrList.push(...carryProps(props, skip))
  const checked = props['checked'] === true
  const disabled = props['disabled'] === true
  if (disabled) attrList.push('data-disabled="true"')

  if (kindProp === 'checkbox' || node.kind === 'checkbox' || node.kind === 'radio') {
    const type = node.kind === 'radio' ? 'radio' : 'checkbox'
    let html = `<label ${attrList.join(' ')}><input type="${type}"${checked ? ' checked' : ''}${disabled ? ' disabled' : ''} />`
    if (props['label'] !== undefined && props['label'] !== null && props['label'] !== '') {
      html += `<span data-part="label">${escHtml(String(props['label']))}</span>`
    }
    html += '</label>'
    return html
  }

  let html = `<div ${attrList.join(' ')} data-checked="${checked ? 'true' : 'false'}">`
  html += `<div data-part="track" role="switch" aria-checked="${checked ? 'true' : 'false'}" tabindex="${disabled ? '-1' : '0'}"><div data-part="thumb"></div></div>`
  if (props['label'] !== undefined && props['label'] !== null && props['label'] !== '') {
    html += `<span data-part="label">${escHtml(String(props['label']))}</span>`
  }
  if (props['description'] !== undefined && props['description'] !== null && props['description'] !== '') {
    html += `<span data-part="description">${escHtml(String(props['description']))}</span>`
  }
  html += '</div>'
  return html
}
