/**
 * Page graph — the per-page render slice for request-time rendering.
 *
 * `extractPageGraph` runs at build time: it walks one page's subgraph (roots
 * plus the page node itself — the same walk `buildManifest` does) and returns
 * a JSON-safe slice. The emitter writes it to `server/pages/<name>.json` for
 * `render: 'server'` pages only.
 *
 * `hydratePageGraph` runs per request: it rebuilds a minimal IR from the slice
 * so `renderPageHtml` produces byte-identical output to the build. Handles
 * from `ctx.ui.get(id)` mutate this IR before rendering — that is the whole
 * server-render path: load, set data, render.
 *
 * Known limit: function-valued props do not survive JSON. Data flows; a
 * `format: (v) => ...` cell formatter does not (yet — it would need a
 * registry key instead of a closure).
 */
import { createEmptyIR, type AppNode, type LibraryDecl, type ProjectIR } from '../ir'

export interface PageGraphJson {
  page: { name: string; address: string; rootIds: string[]; app: string | null; render: 'static' | 'spa' | 'server' }
  objects: Record<string, {
    id: string
    kind: string
    props: Record<string, unknown>
    children: string[]
    parentId: string | null
    contentTemplateId: string | null
    bindings: Array<{ prop: string; source: string }>
    breakpointProps: Record<string, Record<string, unknown>>
    tracked: string[]
    inlineWhens: Array<{ objectId: string; event: string }>
    customObject?: string
  }>
  stateDefaults: Record<string, unknown>
  stateDecls?: Record<string, { address?: string; keep?: 'session' | 'device' }>
  libraries: LibraryDecl[]
  icons: Record<string, unknown>
  breakpoints: Record<string, { minWidth?: number; maxWidth?: number; label?: string }>
  measures: Record<string, number | string>
  vars: Record<string, unknown>
  apps: AppNode[]
}

export function extractPageGraph(ir: ProjectIR, pageName: string): PageGraphJson {
  const page = ir.pages.get(pageName)
  if (!page) throw new Error(`unknown page "${pageName}"`)
  const include = new Set<string>([pageName])
  const stack: string[] = [...page.rootIds]
  while (stack.length) {
    const id = stack.pop() as string
    if (include.has(id)) continue
    include.add(id)
    const node = ir.objects.get(id)
    if (!node) continue
    for (const child of node.children) stack.push(child)
    if (node.contentTemplateId) stack.push(node.contentTemplateId)
  }
  const objects: PageGraphJson['objects'] = {}
  for (const id of include) {
    const node = ir.objects.get(id)
    if (!node) continue
    objects[id] = {
      id: node.id,
      kind: node.kind,
      props: node.props,
      children: [...node.children],
      parentId: node.parentId,
      contentTemplateId: node.contentTemplateId,
      bindings: node.bindings.map((b) => ({ prop: b.prop, source: b.source })),
      breakpointProps: node.breakpointProps,
      tracked: [...node.tracked],
      inlineWhens: node.inlineWhens.map((w) => ({ objectId: w.objectId, event: w.event })),
      ...(node.customObject ? { customObject: node.customObject } : {}),
    }
  }
  const app = page.app ? ir.apps.get(page.app) : undefined
  return {
    page: { name: page.name, address: page.address, rootIds: [...page.rootIds], app: page.app, render: page.render },
    objects,
    stateDefaults: ir.stateDefaults,
    stateDecls: Object.fromEntries(ir.stateDecls),
    libraries: [...ir.libraries.values()],
    icons: Object.fromEntries(ir.icons),
    breakpoints: Object.fromEntries(ir.breakpoints),
    measures: Object.fromEntries(ir.measures),
    vars: ir.vars,
    apps: app ? [{ ...app }] : [],
  }
}

export function hydratePageGraph(json: PageGraphJson): ProjectIR {
  // Deep-clone every value: the parsed artifact may be cached across requests,
  // and a handle mutation must never leak from one request into the next.
  // structuredClone is available everywhere this runs (node 17+, workers).
  const clone = <T>(v: T): T => structuredClone(v);
  const ir = createEmptyIR()
  ir.pages.set(json.page.name, { ...json.page, rootIds: [...json.page.rootIds] })
  for (const [id, node] of Object.entries(json.objects)) {
    ir.objects.set(id, {
      id: node.id,
      kind: node.kind,
      props: clone(node.props),
      children: [...node.children],
      parentId: node.parentId,
      contentTemplateId: node.contentTemplateId,
      bindings: node.bindings.map((b) => ({ ...b })),
      breakpointProps: clone(node.breakpointProps),
      tracked: [...node.tracked],
      inlineWhens: node.inlineWhens.map((w) => ({ ...w })),
      ...(node.customObject ? { customObject: node.customObject } : {}),
    })
  }
  ir.stateDefaults = clone(json.stateDefaults)
  for (const [k, v] of Object.entries(json.stateDecls ?? {})) ir.stateDecls.set(k, { ...v })
  for (const lib of json.libraries) ir.libraries.set(lib.name, { ...lib })
  for (const [k, v] of Object.entries(json.icons)) ir.icons.set(k, v as { kind: string; [key: string]: unknown })
  for (const [k, v] of Object.entries(json.breakpoints)) ir.breakpoints.set(k, { ...v })
  for (const [k, v] of Object.entries(json.measures)) ir.measures.set(k, v)
  ir.vars = json.vars
  for (const app of json.apps) ir.apps.set(app.name, { ...app, pages: [...app.pages] })
  return ir
}
