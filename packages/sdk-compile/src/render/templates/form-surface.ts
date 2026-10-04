/**
 * Form templates: form, login, signup.
 *
 * A form is a projection surface over whatever fields were placed into it. The
 * renderer does not invent inputs — it wraps the declared children in field
 * rows, collects their `name`s so the client can read values back, and carries
 * the validation rules the client enforces on submit.
 */
import { baseAttrs, carryProps, escAttr, escHtml, type RenderNode } from '../html';
import { iconFor, withIcon } from '../icons';
import { renderNode } from '../node';
import type { ProjectIR } from '../../ir';

/** Field kinds that become a `[data-part="field"]` row. */
const FIELD_KINDS = new Set(['input', 'textarea', 'select', 'switch', 'checkbox', 'radio', 'toggle', 'form-field']);

/**
 * A standalone label. Associates with a control via `for`, and renders either
 * its own text or whatever was placed into it.
 */
export function renderLabel(ir: ProjectIR, node: RenderNode): string {
  const props = node.props
  const attrList = baseAttrs(node)
  const target = props['for'] ?? props['htmlFor'] ?? props['control']
  if (typeof target === 'string' && target !== '') attrList.push(`for="${escAttr(target)}"`)
  if (props['required'] === true) attrList.push('data-required="true"')
  const skip = new Set(['id', 'name', 'placement', 'data', 'address', 'app', 'content', 'text', 'label', 'for', 'htmlFor', 'control', 'required', 'icon', 'iconPosition'])
  attrList.push(...carryProps(props, skip))

  const own = props['content'] ?? props['text'] ?? props['label']
  const inner = own !== undefined && own !== null && own !== ''
    ? escHtml(String(own))
    : node.children.map((c) => renderNode(ir, c)).join('')
  const icon = iconFor(ir, props)
  return `<label ${attrList.join(' ')}>${withIcon(inner, icon)}</label>`
}

export function renderForm(ir: ProjectIR, node: RenderNode): string {
  const props = node.props;
  const attrList = baseAttrs(node);

  if (props['noValidate'] !== false) attrList.push('novalidate');
  if (typeof props['action'] === 'string' && props['action'] !== '') attrList.push(`data-action="${escAttr(props['action'])}"`);
  if (props['emitPayload'] === false) attrList.push('data-emit-payload="false"');

  // Client-side rules, carried verbatim for the submit handler to enforce.
  if (props['rules'] && typeof props['rules'] === 'object') {
    attrList.push(`data-rules="${escAttr(JSON.stringify(props['rules']))}"`);
  }

  const isValid = props['isValid'] !== false;
  attrList.push(`data-valid="${isValid ? 'true' : 'false'}"`);
  if (props['isSubmitting'] === true) attrList.push('data-submitting="true"');

  // Initial errors declared at build time.
  if (props['errors'] && typeof props['errors'] === 'object') {
    attrList.push(`data-errors="${escAttr(JSON.stringify(props['errors']))}"`);
  }
  // Initial values, applied to the fields by the client on first paint.
  if (props['values'] && typeof props['values'] === 'object') {
    attrList.push(`data-values="${escAttr(JSON.stringify(props['values']))}"`);
  }

  const skip = new Set([
    'id', 'name', 'placement', 'data', 'address', 'app',
    'layout', 'action', 'emitPayload', 'rules', 'isValid', 'isSubmitting',
    'errors', 'values', 'noValidate', 'submitLabel', 'title', 'description',
    'icon', 'iconPosition',
  ]);
  attrList.push(...carryProps(props, skip));

  const layout = typeof props['layout'] === 'string' ? props['layout'] : 'vertical';
  attrList.push(`data-layout="${escAttr(layout)}"`);

  // Header — only when the form declares a title/description of its own.
  let html = `<form ${attrList.join(' ')}>`
  if (props['title'] !== undefined && props['title'] !== '') {
    html += `<div data-part="header"><div data-part="title">${escHtml(String(props['title']))}</div>`
    if (props['description'] !== undefined && props['description'] !== '') {
      html += `<div data-part="hint">${escHtml(String(props['description']))}</div>`
    }
    html += '</div>'
  }

  // Children: field kinds get a labelled row, everything else renders inline.
  for (const childId of node.children) {
    const child = ir.objects.get(childId)
    if (!child) continue
    const childProps = child.props as Record<string, unknown>
    if (!FIELD_KINDS.has(child.kind)) {
      html += renderNode(ir, childId)
      continue
    }
    html += renderFieldRow(ir, childId, child.kind, childProps)
  }

  // Footer: a submit control, declared or implied by submitLabel.
  if (props['submitLabel'] !== undefined && props['submitLabel'] !== '') {
    html += `<div data-part="footer"><button type="submit" data-part="submit">${escHtml(String(props['submitLabel']))}</button></div>`
  } else if (node.kind === 'login' || node.kind === 'signup') {
    const label = node.kind === 'login' ? 'Sign in' : 'Create account'
    html += `<div data-part="footer"><button type="submit" data-part="submit">${label}</button></div>`
  }

  html += '</form>'
  const icon = iconFor(ir, props)
  return icon.html ? withIcon(html, icon) : html
}

/** One field row: label, control, hint. */
function renderFieldRow(ir: ProjectIR, childId: string, kind: string, childProps: Record<string, unknown>): string {
  const required = childProps['required'] === true || (childProps['rules'] && typeof childProps['rules'] === 'object' && 'required' in (childProps['rules'] as object))
  let row = `<div data-part="field" data-field="${escAttr(childId)}">`

  // A declared label wins; otherwise a required field gets an asterisk marker.
  if (childProps['label'] !== undefined && childProps['label'] !== '') {
    row += `<label data-part="label"${required ? ' data-required="true"' : ''} for="${escAttr(childId)}">${escHtml(String(childProps['label']))}</label>`
  }

  // The control itself, rendered by its own template.
  row += `<div data-part="control">${renderNode(ir, childId)}</div>`

  if (childProps['hint'] !== undefined && childProps['hint'] !== '') {
    row += `<div data-part="hint">${escHtml(String(childProps['hint']))}</div>`
  }
  if (childProps['error'] !== undefined && childProps['error'] !== null && childProps['error'] !== '') {
    row += `<div data-part="error" role="alert">${escHtml(String(childProps['error']))}</div>`
  }
  row += '</div>'
  void kind
  return row
}
