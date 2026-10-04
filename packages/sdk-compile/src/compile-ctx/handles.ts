/**
 * Recording object handles: nodes, placement, props.
 */
import type { CustomObjectDefinition, MorganaConfig } from '@morgana/sdk';
import type { BindingRecord, ObjNode, ProjectIR } from '../ir';
import { resolveMakeToken } from './tokens';

const SURFACE_KINDS = new Set([
  'page', 'box', 'container', 'grid', 'card', 'group', 'stage',
  'vstack', 'hstack',
  'tabs', 'accordion', 'dialog', 'dropdown', 'tooltip', 'form',
  'login', 'signup', 'header', 'main', 'footer', 'nav', 'section', 'article', 'slot', 'list',
  'link', 'button',
])

export interface CompileState {
  ir: ProjectIR
  config: MorganaConfig
  actionName: string
  /**
   * The project's custom object components, loaded so their `define` and
   * `methods` are callable. The serializable half lives in `ir.customObjects`
   * for the manifest; this is the half that has to actually run.
   */
  customObjects?: Map<string, CustomObjectDefinition>
}

/** Monotonic suffix for generated ids — shared across creators. */
let autoId = 0

export function nextAutoId(): number {
  autoId += 1
  return autoId
}
export function ensureNode(state: CompileState, kind: string, props: Record<string, unknown>): ObjNode {
  const ir = state.ir
  const rawId = typeof props['id'] === 'string' && props['id'] ? (props['id'] as string) : typeof props['name'] === 'string' && props['name'] ? (props['name'] as string) : null
  const id = rawId ?? `${kind}_${nextAutoId().toString(36)}`
  const existing = ir.objects.get(id)
  if (existing) {
    Object.assign(existing.props, props)
    return existing
  }
  const node: ObjNode = {
    id,
    kind,
    props: { ...props },
    children: [],
    parentId: null,
    contentTemplateId: null,
    bindings: [],
    breakpointProps: {},
    tracked: [],
    inlineWhens: [],
  }
  ir.objects.set(id, node)
  return node
}

function detach(ir: ProjectIR, node: ObjNode): void {
  if (node.parentId) {
    const parent = ir.objects.get(node.parentId)
    if (parent) parent.children = parent.children.filter((c) => c !== node.id)
    for (const page of ir.pages.values()) {
      page.rootIds = page.rootIds.filter((c) => c !== node.id)
    }
    node.parentId = null
  } else {
    for (const page of ir.pages.values()) {
      page.rootIds = page.rootIds.filter((c) => c !== node.id)
    }
  }
}

/** A node id that is in use nowhere else — ids are the IR's identity. */
function freshId(ir: ProjectIR, taken: Set<string>, base: string): string {
  let id = ''
  do {
    id = `${base}_${nextAutoId().toString(36)}`
  } while (taken.has(id) || ir.objects.has(id))
  taken.add(id)
  return id
}

/**
 * Deep-copy a prop value, rewiring any object handles inside it to the clone.
 * Functions, class instances and DOM nodes pass through by reference — a
 * derived value is a closure, not data, and copying it would break it.
 */
function copyValue(
  value: unknown,
  state: CompileState,
  remap: Map<string, string>,
  seen: Map<unknown, unknown> = new Map(),
): unknown {
  if (Array.isArray(value)) {
    const hit = seen.get(value)
    if (hit) return hit
    const out: unknown[] = []
    seen.set(value, out)
    for (const entry of value) out.push(copyValue(entry, state, remap, seen))
    return out
  }
  if (value === null || typeof value !== 'object') return value
  const obj = value as Record<string, unknown>
  const handleId = obj['__nodeId']
  if (typeof handleId === 'string') {
    const mapped = remap.get(handleId) ?? handleId
    const node = state.ir.objects.get(mapped)
    return node ? makeHandle(state, node) : value
  }
  const proto = Object.getPrototypeOf(obj)
  if (proto !== Object.prototype && proto !== null) return value
  const hit = seen.get(value)
  if (hit) return hit
  const out: Record<string, unknown> = {}
  seen.set(value, out)
  for (const [k, v] of Object.entries(obj)) out[k] = copyValue(v, state, remap, seen)
  return out
}

/**
 * Deep-clone a node and everything under it.
 *
 * The clone is a real sibling, not a shell: component identity (`customObject`),
 * the rendered child tree, bind() templates, bindings, tracked events and
 * inline whens all carry over, with every id remapped so the two trees can be
 * mutated independently. `overrides` land on the root only — children keep the
 * props they were cloned with.
 */
function cloneSubtree(
  state: CompileState,
  root: ObjNode,
  rootId: string,
  overrides: Record<string, unknown>,
): ObjNode {
  const ir = state.ir
  const idFor = new Map<string, string>()
  const order: string[] = []
  const taken = new Set<string>()

  // Pass 1 — allocate every id up front so handles held in props can be rewired
  // and children can be written in any order.
  const assign = (node: ObjNode, id: string): void => {
    idFor.set(node.id, id)
    taken.add(id)
    order.push(node.id)
  }
  assign(root, rootId)
  for (let i = 0; i < order.length; i++) {
    const node = ir.objects.get(order[i])
    if (!node) continue
    for (const childId of node.children) {
      const child = ir.objects.get(childId)
      // Unreachable child, or already seen — the graph is a tree in practice,
      // but a hand-edited or re-placed one should not spin here.
      if (!child || idFor.has(child.id)) continue
      assign(child, freshId(ir, taken, child.id))
    }
    const template = node.contentTemplateId ? ir.objects.get(node.contentTemplateId) : undefined
    if (template && !idFor.has(template.id)) assign(template, freshId(ir, taken, template.id))
  }

  // Pass 2a — register every clone in the graph, props still empty. Handles
  // held in props are copied in 2b and resolve through the graph, so the nodes
  // they point at have to exist before any value is copied.
  const copies = new Map<string, ObjNode>()
  for (const sourceId of order) {
    const src = ir.objects.get(sourceId)
    if (!src) continue
    const id = idFor.get(sourceId)!
    const copy: ObjNode = {
      id,
      kind: src.kind,
      props: {},
      children: src.children.map((c) => idFor.get(c) ?? c),
      // The clone root is unplaced — it is not a child of the source's parent
      // until the caller places it, and claiming otherwise would leave a parent
      // pointing at a child it never listed.
      parentId: sourceId === root.id ? null : src.parentId ? (idFor.get(src.parentId) ?? src.parentId) : null,
      contentTemplateId: src.contentTemplateId ? (idFor.get(src.contentTemplateId) ?? src.contentTemplateId) : null,
      bindings: [],
      breakpointProps: {},
      tracked: [...src.tracked],
      inlineWhens: src.inlineWhens.map((w) => ({ objectId: id, event: w.event })),
    }
    if (src.customObject) copy.customObject = src.customObject
    ir.objects.set(id, copy)
    copies.set(sourceId, copy)
    for (const when of copy.inlineWhens) ir.inlineWhens.push(when)
  }

  // Pass 2b — copy the values that could point at any of them.
  for (const sourceId of order) {
    const src = ir.objects.get(sourceId)
    const copy = copies.get(sourceId)
    if (!src || !copy) continue
    const props = copyValue(src.props, state, idFor) as Record<string, unknown>
    if (sourceId === root.id) Object.assign(props, copyValue(overrides, state, idFor))
    props['id'] = copy.id
    copy.props = props
    copy.bindings = copyValue(src.bindings, state, idFor) as BindingRecord[]
    copy.breakpointProps = copyValue(src.breakpointProps, state, idFor) as Record<string, Record<string, unknown>>
  }

  return copies.get(root.id)!
}

/** Recording ObjectHandle — matches the SDK ObjectHandle method surface. */
export function makeHandle(state: CompileState, node: ObjNode): Record<string, unknown> & { __nodeId: string } {
  const ir = state.ir
  const handle: Record<string, unknown> & { __nodeId: string } = {
    __nodeId: node.id,
    get name() {
      return node.id
    },
    get type() {
      return node.kind
    },
    family: 'interactive',
    get: (prop: string) => (node.props as Record<string, unknown>)[prop],
    set: (prop: string, value: unknown) => {
      node.props[prop] = value
    },
    setProps: (props: Record<string, unknown>) => {
      Object.assign(node.props, props)
    },
    make: (...args: unknown[]) => {
      if (args.length === 2 && typeof args[0] === 'string') {
        node.props[args[0] as string] = args[1]
        return
      }
      if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
        Object.assign(node.props, args[0] as Record<string, unknown>)
        return
      }
      if (args.length === 1 && typeof args[0] === 'string') {
        Object.assign(node.props, resolveMakeToken(node.kind, args[0] as string))
        return
      }
    },
    setWithBreakpoint: (bp: string, propOrProps: string | Record<string, unknown>, value?: unknown) => {
      const scope = (node.breakpointProps[bp] ??= {})
      if (typeof propOrProps === 'string') scope[propOrProps] = value
      else Object.assign(scope, propOrProps)
    },
    getWithBreakpoint: (bp: string, prop: string) => node.breakpointProps[bp]?.[prop],
    breakpointProps: () => node.breakpointProps,
    clearBreakpoint: (bp: string, prop?: string) => {
      if (prop === undefined) delete node.breakpointProps[bp]
      else if (node.breakpointProps[bp]) delete node.breakpointProps[bp]![prop]
    },
    place: (child: unknown, placement?: unknown) => {
      const childId = (child as { __nodeId?: string })?.__nodeId
      if (!childId) throw new Error(`place() expects an object handle (got ${typeof child})`)
      const childNode = ir.objects.get(childId)
      if (!childNode) throw new Error(`place() unknown child "${childId}"`)
      if (!SURFACE_KINDS.has(node.kind)) {
        throw new Error(`place() not allowed on "${node.kind}" — only surfaces place children`)
      }
      if (childNode.parentId) detach(ir, childNode)
      childNode.parentId = node.id
      if (!node.children.includes(childId)) node.children.push(childId)
      if (placement !== undefined) childNode.props['placement'] = placement
    },
    addContent: (template: unknown) => {
      const tid = (template as { __nodeId?: string })?.__nodeId
      if (!tid) throw new Error('addContent() expects an object handle template')
      node.contentTemplateId = tid
    },
    bind: (source: unknown, shape?: unknown) => {
      if (typeof source === 'string') {
        node.bindings.push({ prop: '*', source, shape: (shape as Record<string, unknown>) as { items?: string; key?: string; fields?: Record<string, string> } | undefined })
      } else if (Array.isArray(source)) {
        node.props['data'] = source
      }
    },
    clone: (opts?: Record<string, unknown>) => {
      const overrides: Record<string, unknown> = { ...(opts ?? {}) }
      const rawId = overrides['id']
      delete overrides['id']
      let rootId: string
      if (typeof rawId === 'string' && rawId) {
        if (ir.objects.has(rawId)) throw new Error(`clone() id "${rawId}" is already in use`)
        rootId = rawId
      } else {
        rootId = freshId(ir, new Set(), node.id)
      }
      return makeHandle(state, cloneSubtree(state, node, rootId, overrides))
    },
    copy: (opts?: Record<string, unknown>) => (handle['clone'] as (o?: unknown) => unknown)(opts),
    move: (to: unknown) => {
      node.props['placement'] = to
    },
    remove: () => {
      detach(ir, node)
      for (const childId of [...node.children]) {
        const child = ir.objects.get(childId)
        if (child) {
          child.parentId = null
        }
      }
      ir.objects.delete(node.id)
    },
    when: (event: unknown, _handler: unknown) => {
      const name = typeof event === 'string' ? event : (event as { name?: string })?.name ?? 'unknown'
      node.inlineWhens.push({ objectId: node.id, event: name })
      ir.inlineWhens.push({ objectId: node.id, event: name })
      return () => {}
    },
    track: (event: string) => {
      node.tracked.push(event)
      return { name: event, origin: { name: node.id } }
    },
    animate: () => {},
  }
  return handle
}

export function lookupHandle(state: CompileState, kind: string, name: string): unknown {
  const node = state.ir.objects.get(name)
  if (!node) return undefined
  if (kind !== 'any' && node.kind !== kind) return undefined
  return makeHandle(state, node)
}

export function createKindFn(state: CompileState, kind: string): ((props?: Record<string, unknown>) => unknown) & { create: (props?: Record<string, unknown>) => unknown } {
  const fn = ((props?: Record<string, unknown>) => {
    const node = ensureNode(state, kind, props ?? {})
    return makeHandle(state, node)
  }) as ((props?: Record<string, unknown>) => unknown) & { create: (props?: Record<string, unknown>) => unknown }
  fn.create = (props?: Record<string, unknown>) => {
    const node = ensureNode(state, kind, props ?? {})
    return makeHandle(state, node)
  }
  return fn
}
