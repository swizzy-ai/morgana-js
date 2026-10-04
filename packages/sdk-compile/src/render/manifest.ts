/**
 * Object manifest — the compile-time graph handed to the running page.
 *
 * The page markup already carries `data-entity`/`data-kind` on every node, but
 * markup alone is not enough for `ctx.ui.get(id)`: a live handle needs the
 * object's props, children and bindings to read, and the token context to
 * resolve a new value the same way the compiled stylesheet did. That all
 * travels as one JSON script tag beside the state block.
 */

import { buildStyleCtx, serializeStyleCtx } from '../style/props'
import type { ObjNode, ProjectIR } from '../ir'

export interface ManifestObject {
  kind: string
  props: Record<string, unknown>
  children: string[]
  parent: string | null
  bindings: Array<{ prop: string; source: string }>
  breakpoints: Record<string, Record<string, unknown>>
  tracked: string[]
  /**
   * Set when a custom object component created this object. The kind is whatever
   * the component's `render` said (default 'box'), so the component's name never
   * leaks into the render pipeline — it is identity, not a new kind.
   */
  customObject?: string
}

export interface PageManifest {
  page: string
  address: string
  objects: Record<string, ManifestObject>
  /** Page name → the objects rendered at its root, in order. */
  roots: Record<string, string[]>
  pages: Record<string, { address: string; app: string | null }>
  apps: Array<{ name: string; displayName?: string; description?: string; pages: string[] }>
  icons: Record<string, unknown>
  libraries: Array<{ name: string; cdnUrl: string; globalVar: string }>
  breakpoints: Record<string, { minWidth?: number; maxWidth?: number }>
  /** Public vars from morgana.config.ts — build-time constants, safe to ship. */
  vars: Record<string, unknown>
  style: ReturnType<typeof serializeStyleCtx>
}

function manifestObject(node: ObjNode): ManifestObject {
  return {
    kind: node.kind,
    props: node.props,
    children: [...node.children],
    parent: node.parentId,
    bindings: node.bindings.map((b) => ({ prop: b.prop, source: b.source })),
    breakpoints: node.breakpointProps,
    tracked: [...node.tracked],
    customObject: node.customObject,
  }
}

/**
 * Every object in the project, keyed by id. Pages are included so
 *  `ctx.ui.pages.get(name)` and `ctx.ui.page` have something to describe.
 *
 * Only what THIS page renders ships. The graph is walked from the page's roots
 * (plus the page node itself), because an object on another page has no element
 * here and a live handle to it could do nothing but mislead. Shared registries
 * — icons, measures, breakpoints, the token context — stay project-wide.
 */
export function buildManifest(ir: ProjectIR, pageName: string): PageManifest {
  const objects: Record<string, ManifestObject> = {}
  const roots: Record<string, string[]> = {}
  for (const [name, page] of ir.pages) roots[name] = [...page.rootIds]

  const include = new Set<string>([pageName])
  const stack: string[] = [...(ir.pages.get(pageName)?.rootIds ?? [])]
  while (stack.length) {
    const id = stack.pop() as string
    if (include.has(id)) continue
    include.add(id)
    const node = ir.objects.get(id)
    if (!node) continue
    for (const child of node.children) stack.push(child)
    if (node.contentTemplateId) include.add(node.contentTemplateId)
  }
  for (const id of include) {
    const node = ir.objects.get(id)
    if (node) objects[id] = manifestObject(node)
  }

  return {
    page: pageName,
    address: ir.pages.get(pageName)?.address ?? `/${pageName}`,
    objects,
    roots,
    pages: Object.fromEntries(
      [...ir.pages].map(([name, p]) => [name, { address: p.address, app: p.app }]),
    ),
    apps: [...ir.apps.values()].map((a) => ({
      name: a.name,
      displayName: a.displayName,
      description: a.description,
      pages: [...a.pages],
    })),
    icons: Object.fromEntries(ir.icons),
    libraries: [...ir.libraries.values()].map((l) => ({
      name: l.name,
      cdnUrl: l.cdnUrl,
      globalVar: l.globalVar,
    })),
    breakpoints: Object.fromEntries(
      [...ir.breakpoints].map(([name, shape]) => [
        name,
        { minWidth: shape.minWidth, maxWidth: shape.maxWidth },
      ]),
    ),
    vars: (ir.vars ?? {}) as Record<string, unknown>,
    style: serializeStyleCtx(buildStyleCtx(ir)),
  }
}

/** JSON safe to inline in a <script> block. */
export function manifestJson(manifest: PageManifest): string {
  return JSON.stringify(manifest).replace(/</g, '\\u003c')
}
