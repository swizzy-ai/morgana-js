/**
 * HTML primitives — escaping, identity attributes, prop carriers.
 * Pure mappers: no IR mutation, no DOM.
 */

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
  return attrList
}

/** Carry unknown props as data-prop-* (style + behavior read them back). */
export function carryProps(props: Record<string, unknown>, skip: Set<string>): string[] {
  const out: string[] = []
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || skip.has(k)) continue
    out.push(`data-prop-${escAttr(k)}="${escAttr(String(v))}"`)
  }
  return out
}

export const STRUCTURAL_PROPS = new Set(['id', 'name', 'placement', 'data', 'address', 'app'])
