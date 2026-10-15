/**
 * HTML primitives — escaping, identity attributes, prop carriers.
 * Pure mappers: no IR mutation, no DOM.
 */

import { togglesVisibility } from '../style/conditions'

export function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function escAttr(s: string): string {
  return escHtml(s).replace(/\n/g, '&#10;')
}
export type RenderNode = {
  id: string
  kind: string
  /** The custom object component that created this node, when one did. */
  customObject?: string
  props: Record<string, unknown>
  children: string[]
  bindings: Array<{ prop: string; source: string; shape?: { items?: string; key?: string; fields?: Record<string, string> } }>
  breakpointProps: Record<string, unknown>
}
export function baseAttrs(node: RenderNode): string[] {
  const attrList = [`data-entity="${escAttr(node.id)}"`, `data-kind="${escAttr(node.kind)}"`]
  // A component's own name, so its CSS can target what the author called it
  // rather than the built-in kind it renders as.
  if (node.customObject) attrList.push(`data-object="${escAttr(node.customObject)}"`)
  if (node.bindings.length > 0) {
    // One attribute, `;`-joined — duplicate data-bind attributes are invalid
    // HTML and browsers keep only the first.
    attrList.push(`data-bind="${escAttr(node.bindings.map((b) => `${b.prop}:${b.source}`).join(';'))}"`)
  }
  if (node.breakpointProps && Object.keys(node.breakpointProps).length > 0) {
    attrList.push(`data-breakpoints="${escAttr(Object.keys(node.breakpointProps).join(' '))}"`)
  }
  // Theme scope and colour mode for this object and everything inside it.
  const theme = node.props?.['theme']
  if (typeof theme === 'string' && theme !== '') attrList.push(`data-theme="${escAttr(theme.toLowerCase())}"`)
  const mode = node.props?.['mode']
  if (mode === 'light' || mode === 'dark' || mode === 'system') attrList.push(`data-mode="${mode}"`)
  // Hidden at build: the same inline display:none the runtime applies (and
  // clears on show). An attribute or class would lose to the object's own
  // `display` rule, so the object painted on first load anyway.
  // An object whose conditions show or hide it keeps its base `hidden` in the
  // stylesheet instead, where a condition rule can override it.
  const hidden = node.props?.['hidden']
  if ((hidden === true || hidden === 'true') && !togglesVisibility(node.props ?? {})) attrList.push('style="display:none"')
  // A row stamped from a list template answers to its template's styles.
  const tpl = node.props?.['__tpl']
  if (typeof tpl === 'string' && tpl) attrList.push(`data-tpl="${escAttr(tpl)}"`)
  // Behaviours the page runtime attaches by attribute.
  if (node.props?.['acceptsFiles'] === true) attrList.push('data-accepts-files')
  const browse = node.props?.['browsesFilesFor']
  if (typeof browse === 'string' && browse) attrList.push(`data-browse-files="${escAttr(browse)}"`)
  if (node.props?.['easesHeight'] === true) attrList.push('data-morph')
  const drags = node.props?.['drags']
  if (typeof drags === 'string' && drags) attrList.push(`data-drags="${escAttr(drags)}"`)
  return attrList
}

/** Carry unknown props as data-prop-* (style + behavior read them back). */
export function carryProps(props: Record<string, unknown>, skip: Set<string>): string[] {
  const out: string[] = []
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || skip.has(k) || DIRECTIVE_PROPS.has(k)) continue
    // Objects (hover/focus state styles, item lists) have no attribute form;
    // String() would write "[object Object]" into the markup.
    if (typeof v === 'object' || typeof v === 'function') continue
    // Theme and mode already have their own attributes.
    if (k === 'theme' || k === 'mode') continue
    out.push(`data-prop-${escAttr(k)}="${escAttr(String(v))}"`)
  }
  return out
}

export const STRUCTURAL_PROPS = new Set(['id', 'name', 'placement', 'data', 'address', 'app'])
/** Props that are compile-time instructions, never attributes. */
export const DIRECTIVE_PROPS = new Set(['conditions', 'appear', 'leave', '__tpl', 'acceptsFiles', 'browsesFilesFor', 'easesHeight', 'drags'])
