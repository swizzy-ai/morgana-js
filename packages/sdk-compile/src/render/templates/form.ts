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
  for (const k of ['type', 'name', 'placeholder', 'min', 'max', 'step', 'rows', 'cols']) {
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

export function renderNumberInput(ir: ProjectIR, node: RenderNode): string {
  const props = node.props
  void ir
  const attrList = baseAttrs(node)
  const min = props['min'] !== undefined ? Number(props['min']) : undefined
  const max = props['max'] !== undefined ? Number(props['max']) : undefined
  const step = Number(props['step'] ?? 1) || 1
  const raw = Number(props['value'] ?? min ?? 0)
  const lo = min ?? raw
  const hi = max ?? raw
  const value = Math.max(lo, Math.min(hi, Number.isFinite(raw) ? raw : lo))
  const disabled = props['disabled'] === true
  if (disabled) attrList.push('data-disabled="true"')
  const skip = new Set(['id', 'name', 'placement', 'data', 'address', 'app', 'value', 'min', 'max', 'step', 'disabled', 'size', 'variant', 'placeholder'])
  attrList.push(...carryProps(props, skip))

  // Native number input carries keyboard/spinner semantics; the stepper
  // buttons drive the same clamp through the methods (no parallel logic).
  let html = `<div ${attrList.join(' ')} data-value="${value}"${min !== undefined ? ` data-min="${min}"` : ''}${max !== undefined ? ` data-max="${max}"` : ''}>`
  html += `<button type="button" data-part="decrement" aria-label="Decrease"${disabled ? ' disabled' : ''}>−</button>`
  const nameAttr = typeof props['name'] === 'string' && props['name'] !== '' ? ` name="${escAttr(String(props['name']))}"` : ''
  const phAttr = typeof props['placeholder'] === 'string' && props['placeholder'] !== '' ? ` placeholder="${escAttr(String(props['placeholder']))}"` : ''
  html += `<input type="number"${nameAttr}${phAttr} min="${min ?? ''}" max="${max ?? ''}" step="${step}" value="${value}"${disabled ? ' disabled' : ''} />`
  html += `<button type="button" data-part="increment" aria-label="Increase"${disabled ? ' disabled' : ''}>+</button>`
  html += '</div>'
  return html
}

export function renderPinInput(ir: ProjectIR, node: RenderNode): string {
  const props = node.props
  void ir
  const attrList = baseAttrs(node)
  const length = Math.max(1, Math.min(12, Math.floor(Number(props['length'] ?? 4)) || 4))
  const disabled = props['disabled'] === true
  const mask = props['mask'] === true
  const otp = props['otp'] !== false
  if (disabled) attrList.push('data-disabled="true"')
  const skip = new Set(['id', 'name', 'placement', 'data', 'address', 'app', 'value', 'length', 'disabled', 'size', 'mask', 'otp'])
  attrList.push(...carryProps(props, skip))
  const value = String(props['value'] ?? '')

  // One native input per cell: mobile keyboards, autocomplete=one-time-code,
  // and selection all work without reimplementation. The delegation advances.
  let html = `<div ${attrList.join(' ')} data-length="${length}" data-value="${escAttr(value)}">`
  for (let i = 0; i < length; i += 1) {
    const ch = value[i] ?? ''
    html += `<input data-part="cell" data-index="${i}" inputmode="numeric" pattern="[0-9]*" maxlength="1" autocomplete="${otp && i === 0 ? 'one-time-code' : 'off'}" type="${mask ? 'password' : 'text'}" value="${escAttr(ch)}"${disabled ? ' disabled' : ''} />`
  }
  html += '</div>'
  return html
}

export function renderSlider(ir: ProjectIR, node: RenderNode): string {
  const props = node.props
  void ir
  const attrList = baseAttrs(node)
  const min = Number(props['min'] ?? 0)
  const max = Number(props['max'] ?? 100)
  const step = Number(props['step'] ?? 1) || 1
  const raw = Number(props['value'] ?? min)
  const clamped = Math.max(min, Math.min(max, Number.isFinite(raw) ? raw : min))
  const snapped = Math.round((clamped - min) / step) * step + min
  const value = Math.max(min, Math.min(max, snapped))
  const vertical = props['orientation'] === 'vertical'
  const disabled = props['disabled'] === true
  const showValue = props['showValue'] === true
  if (disabled) attrList.push('data-disabled="true"')
  if (vertical) attrList.push('data-vertical="true"')
  const skip = new Set(['id', 'name', 'placement', 'data', 'address', 'app', 'value', 'min', 'max', 'step', 'orientation', 'disabled', 'size', 'variant', 'showValue'])
  attrList.push(...carryProps(props, skip))
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0

  // One object, three parts: the track/fill divs carry our styling (same
  // system as progress fill), the native range input carries keyboard and
  // form semantics. The input is transparent over the track — pointer hits
  // the thumb, styling comes from our divs.
  let html = `<div ${attrList.join(' ')} data-value="${value}" data-min="${min}" data-max="${max}">`
  html += `<div data-part="track"><div data-part="fill" style="width:${Math.round(pct * 10) / 10}%"></div></div>`
  html += `<input type="range" data-part="input" min="${min}" max="${max}" step="${step}" value="${value}"${disabled ? ' disabled' : ''} />`
  if (showValue) html += `<span data-part="value">${value}</span>`
  html += '</div>'
  return html
}

export function renderCombobox(ir: ProjectIR, node: RenderNode): string {
  const props = node.props
  void ir
  const attrList = baseAttrs(node)
  const disabled = props['disabled'] === true
  const multiple = props['multiple'] === true
  const value = props['value'] ?? (multiple ? [] : '')
  if (disabled) attrList.push('data-disabled="true"')
  if (multiple) attrList.push('data-multiple="true"')
  const skip = new Set(['id', 'name', 'placement', 'data', 'address', 'app', 'options', 'value', 'placeholder', 'disabled', 'multiple', 'clearable', 'size', 'variant'])
  attrList.push(...carryProps(props, skip))
  const options = Array.isArray(props['options']) ? (props['options'] as Array<Record<string, unknown>>) : []
  const placeholder = typeof props['placeholder'] === 'string' ? props['placeholder'] : ''

  let html = `<div ${attrList.join(' ')} data-value="${escAttr(Array.isArray(value) ? value.join(',') : String(value ?? ''))}">`
  html += `<input data-part="search" placeholder="${escAttr(placeholder)}"${disabled ? ' disabled' : ''} autocomplete="off" role="combobox" aria-expanded="false" />`
  html += '<div data-part="panel" hidden>'
  for (const o of options) {
    if (!o || typeof o !== 'object') continue
    const label = String(o['label'] ?? o['value'] ?? '')
    const val = String(o['value'] ?? label)
    html += `<div data-part="option" data-value="${escAttr(val)}" role="option" aria-selected="false"${o['disabled'] === true ? ' data-disabled="true"' : ''}>${escHtml(label)}</div>`
  }
  html += '</div></div>'
  return html
}

export function renderTagsInput(ir: ProjectIR, node: RenderNode): string {
  const props = node.props
  void ir
  const attrList = baseAttrs(node)
  const disabled = props['disabled'] === true
  if (disabled) attrList.push('data-disabled="true"')
  const skip = new Set(['id', 'name', 'placement', 'data', 'address', 'app', 'value', 'placeholder', 'disabled', 'max', 'size'])
  attrList.push(...carryProps(props, skip))
  const tags = Array.isArray(props['value']) ? (props['value'] as unknown[]).map((t) => String(t)) : []
  const placeholder = typeof props['placeholder'] === 'string' ? props['placeholder'] : ''

  let html = `<div ${attrList.join(' ')} data-value="${escAttr(tags.join(','))}">`
  for (const tag of tags) {
    html += `<span data-part="tag" data-tag="${escAttr(tag)}">${escHtml(tag)}<button type="button" data-part="tag-remove" aria-label="Remove">×</button></span>`
  }
  html += `<input data-part="entry" placeholder="${escAttr(placeholder)}"${disabled ? ' disabled' : ''} />`
  html += '</div>'
  return html
}

export function renderRating(ir: ProjectIR, node: RenderNode): string {
  const props = node.props
  void ir
  const attrList = baseAttrs(node)
  const max = Math.max(1, Math.min(10, Math.floor(Number(props['max'] ?? 5)) || 5))
  const value = Math.max(0, Math.min(max, Math.floor(Number(props['value'] ?? 0)) || 0))
  const disabled = props['disabled'] === true
  if (disabled) attrList.push('data-disabled="true"')
  const skip = new Set(['id', 'name', 'placement', 'data', 'address', 'app', 'value', 'max', 'disabled', 'size'])
  attrList.push(...carryProps(props, skip))

  let html = `<div ${attrList.join(' ')} data-value="${value}" data-max="${max}" role="radiogroup">`
  for (let i = 1; i <= max; i += 1) {
    html += `<button type="button" data-part="star" data-star="${i}" data-on="${i <= value ? 'true' : 'false'}" role="radio" aria-checked="${i <= value ? 'true' : 'false'}"${disabled ? ' disabled' : ''}>★</button>`
  }
  html += '</div>'
  return html
}

export function renderEditable(ir: ProjectIR, node: RenderNode): string {
  const props = node.props
  void ir
  const attrList = baseAttrs(node)
  const disabled = props['disabled'] === true
  if (disabled) attrList.push('data-disabled="true"')
  const skip = new Set(['id', 'name', 'placement', 'data', 'address', 'app', 'value', 'placeholder', 'disabled'])
  attrList.push(...carryProps(props, skip))
  const value = String(props['value'] ?? '')
  const placeholder = typeof props['placeholder'] === 'string' && props['placeholder'] !== '' ? props['placeholder'] : 'Click to edit'

  let html = `<div ${attrList.join(' ')} data-editing="false" data-value="${escAttr(value)}">`
  html += `<span data-part="preview" tabindex="0">${value !== '' ? escHtml(value) : `<span data-part="empty">${escHtml(placeholder)}</span>`}</span>`
  html += `<input data-part="editor" value="${escAttr(value)}" hidden />`
  html += '</div>'
  return html
}

export function renderFileUpload(ir: ProjectIR, node: RenderNode): string {
  const props = node.props
  void ir
  const attrList = baseAttrs(node)
  const disabled = props['disabled'] === true
  const multiple = props['multiple'] !== false
  if (disabled) attrList.push('data-disabled="true"')
  const skip = new Set(['id', 'name', 'placement', 'data', 'address', 'app', 'accept', 'multiple', 'maxFiles', 'disabled'])
  attrList.push(...carryProps(props, skip))
  const accept = typeof props['accept'] === 'string' ? props['accept'] : ''

  let html = `<div ${attrList.join(' ')}>`
  html += `<div data-part="dropzone" tabindex="0">Drop files here or <button type="button" data-part="browse"${disabled ? ' disabled' : ''}>browse</button></div>`
  html += `<input type="file" data-part="file-input" hidden${accept !== '' ? ` accept="${escAttr(accept)}"` : ''}${multiple ? ' multiple' : ''}${disabled ? ' disabled' : ''} />`
  html += '<div data-part="file-list"></div>'
  html += '</div>'
  return html
}
