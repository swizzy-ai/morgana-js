/**
 * Orchestration — scan → run compile lane → lower → emit.
 *
 * Compile handlers run in Node against the recording ctx. They are real
 * modules: `bundle.ts` resolves their import graph with esbuild and hands back
 * a callable, so a compile action may import siblings, shared helpers and
 * third-party packages. Runtime-only APIs on the ctx still throw.
 */

import { PARAM_SEGMENT_RE } from './server-host/routes'
import fs from 'node:fs'
import path from 'node:path'
import type { AppDefinition, Artifact, CustomObjectDefinition, MorganaConfig } from '@studiomorgana/sdk'
import { hookRunsFor, scanProject, type SdkActionMeta } from './extract'
import {
  discoverCustomObjects,
  loadCustomObjectDefinitions,
  bundleCustomObjects,
} from './custom-objects'
import { discoverServerObjects } from './server-objects'
import { browserObjectMeta, compileServerObjects } from './objects-compile'
import { refreshProjectTypes } from './types'
import { resolveFonts } from './style/fonts'
import { TEXT_SCALE } from './style/tokens'
import { createEmptyIR, type ProjectIR } from './ir'
import {
  buildBrowserCompileCtx,
  buildServerCompileCtx,
  createCompileState,
  type CompileState,
} from './compile-ctx'
import { bundleBrowserActions, bundleCompileAction, bundleServerAction, bundleDesktopAction } from './bundle'
import { renderClientJs } from './client'
import { deriveRoutes, EMITTABLE } from './routes'
import { buildBindingGraph } from './bindings'
import { renderPageHtml } from './render/page'
import { renderStyleCss } from './style/sheet'
import { ACCESS_ACTION, accessModuleWarnings, emitAccessModule } from './access'
import { emitDist, type EmitResult } from './emit'
import { minifyCss } from './style/minify'
import { buildArtifacts, loadPlugins, resolveArtifactRefs } from './plugins'
import { bundleOf, locateError } from './source-errors'

export interface CompileOptions {
  dir: string
  outDir?: string
  actionsDirs?: string[]
  /** Minify emitted JS. Overrides `minify` in morgana.config.ts. */
  minify?: boolean
  /** Minify when neither the caller nor the config says: `morgana build` passes true, dev leaves it off. */
  defaultMinify?: boolean
  /** Build every plugin artifact again, ignoring `.morgana/artifacts/`. */
  rebuildArtifacts?: boolean
}

export interface CompileResult extends EmitResult {
  pages: string[]
  /** Custom object components this project ships. */
  customObjects: string[]
  /** The default page: config.entry when it names a real page, else home, else first. */
  entry: string
  serverActions: string[]
  compileActions: string[]
  /** Desktop-lane action names — bundled to dist/desktop/, never deployed to the cloud. */
  desktopActions: string[]
  warnings: string[]
  /** Whether JS and CSS were minified — the resolved value, not the request. */
  minify: boolean
  /**
   * The compiled graph. Present for in-process consumers (eject); not
   * serialized. Additive — existing readers ignore it.
   */
  ir: ProjectIR
  /** What the project's plugins built. Present only when it lists plugins. */
  artifacts?: Artifact[]
  /** How many of those were built now rather than taken from the cache. */
  artifactsBuilt?: number
}

/**
 * `font` words that are neither in the type scale nor added by the project's
 * `transformers.fonts`. They style nothing, which is easy to miss — `h4`
 * looked plausible for long enough to ship in an example.
 */
function unknownFontWords(ir: ProjectIR): string[] {
  const custom = new Set(ir.transformerMutations.filter((m) => m.domain === 'fonts' && m.op !== 'remove').map((m) => m.key.toLowerCase()))
  const out: string[] = []
  for (const [id, node] of ir.objects) {
    const f = node.props['font']
    if (typeof f === 'string' && !TEXT_SCALE[f] && !TEXT_SCALE[f.toLowerCase()] && !custom.has(f.toLowerCase())) {
      out.push(`object "${id}": font '${f}' is not a type-scale word (${Object.keys(TEXT_SCALE).join(', ')}) — it has no effect`)
    }
  }
  return out
}

/** Order compile actions: hook `run` order first, then the remainder sorted. */
export function orderCompileActions(config: MorganaConfig, compile: SdkActionMeta[]): SdkActionMeta[] {
  const hooks = config.hooks ?? []
  const ordered: SdkActionMeta[] = []
  const remaining = new Map(compile.map((a) => [a.name, a]))
  for (const h of hooks) {
    const ons = Array.isArray(h.on) ? h.on : [h.on]
    if (!ons.includes('compile') || h.enabled === false) continue
    const runs = Array.isArray(h.run) ? h.run : [h.run]
    for (const name of runs) {
      const a = remaining.get(name)
      if (a) {
        ordered.push(a)
        remaining.delete(name)
      }
    }
  }
  ordered.push(...[...remaining.values()].sort((a, b) => a.name.localeCompare(b.name)))
  return ordered
}

function seedFromConfig(ir: ProjectIR, config: MorganaConfig): void {
  // Public vars are build-time constants and safe to ship to the client, where
  // ctx.vars reads them. Private vars never enter the IR.
  ir.vars = { ...((config.vars?.public ?? {}) as Record<string, unknown>) }

  for (const [name, def] of Object.entries(config.apps ?? {})) {
    const appDef = def as AppDefinition
    if (!ir.apps.has(name)) {
      const type = appDef.type ?? 'web'
      // A desktop app declared without a bundle id is a configuration error,
      // not something to paper over. Surfaced as a warning rather than thrown:
      // the config is read at build start, before there is a warning channel to
      // throw into, and failing the whole build for one bad app is worse than
      // saying so loudly.
      if (type === 'desktop' && !appDef.platform?.bundleId) {
        console.warn(
          `[morgana] app "${name}" is type "desktop" but declares no platform.bundleId — ` +
            'it has no identity for the OS to key the install by',
        )
      }
      ir.apps.set(name, {
        name,
        displayName: appDef.displayName,
        description: appDef.description,
        pages: [...(appDef.pages ?? [])],
        type,
        ...(type === 'desktop' && appDef.platform?.bundleId
          ? {
              platform: {
                bundleId: appDef.platform.bundleId,
                ...(appDef.platform.icon ? { icon: appDef.platform.icon } : {}),
              },
            }
          : {}),
        ...(type === 'desktop' && appDef.window
          ? {
              window: {
                ...(appDef.window.width !== undefined ? { width: appDef.window.width } : {}),
                ...(appDef.window.height !== undefined ? { height: appDef.window.height } : {}),
                ...(appDef.window.frameless !== undefined ? { frameless: appDef.window.frameless } : {}),
                ...(appDef.window.transparent !== undefined ? { transparent: appDef.window.transparent } : {}),
                ...(appDef.window.resizable !== undefined ? { resizable: appDef.window.resizable } : {}),
                ...(appDef.window.title ? { title: appDef.window.title } : {}),
              },
            }
          : {}),
      })
    }
  }
  const t = config.transformers as
    | Record<string, { add?: Record<string, unknown>; update?: Record<string, unknown>; remove?: string[] }>
    | undefined
  if (t) {
    for (const [domain, changes] of Object.entries(t)) {
      if (!changes || typeof changes !== 'object') continue
      for (const [key, value] of Object.entries(changes.add ?? {})) {
        ir.transformerMutations.push({ domain, op: 'add', key, value })
      }
      for (const [key, value] of Object.entries(changes.update ?? {})) {
        ir.transformerMutations.push({ domain, op: 'update', key, value })
      }
      for (const key of changes.remove ?? []) {
        ir.transformerMutations.push({ domain, op: 'remove', key })
      }
    }
  }
}

/**
 * The desktop declaration for dist/desktop/app.json — backend package, OS
 * capability list, and every type: 'desktop' app's install identity.
 *
 * Returns undefined when the project has neither desktop actions nor a
 * desktop config block: emit then skips dist/desktop/ entirely, so such a
 * project builds byte-identically to before the lane existed.
 */
function buildDesktopDecl(
  config: MorganaConfig,
  desktopActions: SdkActionMeta[],
  warnings: string[],
): { backend: string; os: string[]; apps: Array<{ name: string; displayName?: string; bundleId: string; icon?: string; window?: { width?: number; height?: number; frameless?: boolean; transparent?: boolean; resizable?: boolean; title?: string } }> } | undefined {
  const hasActions = desktopActions.length > 0
  if (!hasActions && !config.desktop) return undefined
  const apps = Object.entries(config.apps ?? {})
    .filter((entry) => entry[1]?.type === 'desktop')
    .map(([name, def]) => ({
      name,
      ...(def.displayName ? { displayName: def.displayName } : {}),
      bundleId: def.platform?.bundleId ?? 'com.morgana.' + name,
      ...(def.platform?.icon ? { icon: def.platform.icon } : {}),
      ...(def.window ? { window: { ...def.window } } : {}),
    }))
  if (hasActions && !apps.length) {
    warnings.push('desktop actions exist but config.apps declares no type: "desktop" app — using a default install identity')
  }
  return {
    backend: config.desktop?.backend ?? '@studiomorgana/desktop-electron',
    os: [...(config.desktop?.os ?? [])],
    apps,
  }
}

export async function compileProject(opts: CompileOptions): Promise<CompileResult> {
  const dir = path.resolve(opts.dir)
  const outDir = path.resolve(opts.outDir ?? path.join(dir, 'dist'))
  const scan = scanProject({ dir, actionsDirs: opts.actionsDirs })
  const warnings: string[] = [...scan.warnings]
  // A call-site flag wins over the config, which wins over the readable default.
  const minify = opts.minify ?? scan.config.minify ?? opts.defaultMinify ?? false

  const ir = createEmptyIR()
  seedFromConfig(ir, scan.config)

  // Plugins build first, so compile actions can point at what they made
  // (`src: 'asset:coin'`). A project that lists none skips this entirely.
  const pluginSpecs = scan.config.plugins ?? []
  const artifactBuild = pluginSpecs.length
    ? await buildArtifacts({ dir, plugins: await loadPlugins(dir, pluginSpecs), warnings, force: opts.rebuildArtifacts, points: scan.config.points })
    : null

  // Custom objects are discovered and loaded BEFORE the compile lane runs, so a
  // component's creator exists on ctx.ui exactly like a built-in kind's does.
  // Discovery reads the serializable parts from source; loading evaluates the
  // module in Node so its `define` is callable.
  const customWarnings: string[] = []
  const discovered = discoverCustomObjects(dir, customWarnings)
  for (const decl of discovered) ir.customObjects.set(decl.name, decl)
  let customObjects: Map<string, CustomObjectDefinition> = new Map()
  if (discovered.length) {
    try {
      customObjects = await loadCustomObjectDefinitions(dir, discovered)
    } catch (err) {
      throw new Error(
        `cannot load a custom object — ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  const compileActions = orderCompileActions(scan.config, scan.actions.filter((a) => a.lane === 'compile'))
  const compileNames = new Set(compileActions.map((a) => a.name))

  // Hook targets that name an unknown action are almost always a typo — warn.
  const known = new Set(scan.actions.map((a) => a.name))
  for (const h of scan.config.hooks ?? []) {
    const runs = Array.isArray(h.run) ? h.run : [h.run]
    for (const r of runs) {
      if (!known.has(r)) warnings.push(`hook run "${r}" matches no action file`)
    }
  }
  void hookRunsFor

  for (const meta of compileActions) {
    const state: CompileState = { ir, config: scan.config, actionName: meta.name, customObjects }
    const ctx =
      meta.factory === 'client' ? buildBrowserCompileCtx(state) : buildServerCompileCtx(state)
    let fn: (ctx: unknown) => unknown
    try {
      fn = await bundleCompileAction({
        projectDir: dir,
        file: meta.file,
        name: meta.name,
        factory: meta.factory,
      })
    } catch (err) {
      if (err instanceof Error) throw err
      throw new Error(`compile action "${meta.name}": cannot load handler — ${String(err)}`)
    }
    try {
      await fn(ctx)
    } catch (err) {
      // Name the project file and line that threw: the message alone ("cannot
      // read properties of undefined") rarely says where to look.
      const where = locateError(err, bundleOf(fn))
      throw new Error(`compile action "${meta.name}" failed${where ? ` at ${where}` : ''} — ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  if (artifactBuild) resolveArtifactRefs(ir, artifactBuild, warnings)

  // Page addresses are the URL space: required, normalized, unique, and never
  // colliding with reserved prefixes. Fail fast — a bad route ships a 404.
  {
    const RESERVED = new Set(['api', 'assets', 'apps', 'pages'])
    const seen = new Map<string, string>()
    for (const page of ir.pages.values()) {
      const nodeProps = (ir.objects.get(page.name)?.props ?? {}) as Record<string, unknown>
      if (typeof nodeProps['address'] !== 'string' || (nodeProps['address'] as string).trim() === '') {
        throw new Error(`page "${page.name}" declares no address — address is required (e.g. address: '${page.name}')`)
      }
      const stripped = (page.address ?? '').trim().replace(/^\/+|\/+$/g, '')
      page.address = stripped === '' ? '/' : stripped
      if (page.address !== '/') {
        for (const seg of page.address.split('/')) {
          if (seg === '' || seg === '.' || seg === '..' || seg.includes('\\')) {
            throw new Error(`page "${page.name}" address "/${page.address}/" has an illegal segment "${seg}"`)
          }
          if (seg.startsWith(':') && !PARAM_SEGMENT_RE.test(seg)) {
            throw new Error(`page "${page.name}" address "/${page.address}/" has a bad param "${seg}" — use :name (letters, digits, _)`)
          }
        }
        if (/^:[^/]*$/.test(page.address)) {
          warnings.push(`page "${page.name}" address "/${page.address}/" matches every one-segment URL — literal pages still win, but consider a prefix`)
        }
        const first = page.address.split('/')[0]!.toLowerCase()
        if (RESERVED.has(first)) {
          throw new Error(`page "${page.name}" address "/${page.address}/" collides with reserved "/${first}/"`)
        }
      }
      const key = page.address.toLowerCase()
      const clash = seen.get(key)
      if (clash) {
        throw new Error(`pages "${clash}" and "${page.name}" claim the same address "/${page.address}/"`)
      }
      seen.set(key, page.name)
      const raw = nodeProps['render']
      if (raw === 'server' || raw === 'spa' || raw === 'static') {
        page.render = raw
      } else if (raw !== undefined) {
        throw new Error(`page "${page.name}" has unknown render mode "${String(raw)}" — want 'static', 'spa' or 'server'`)
      } else if (nodeProps['spa'] === true || nodeProps['isSpa'] === true) {
        page.render = 'spa'
      } else {
        page.render = 'static'
      }
      const access = nodeProps['access']
      if (access === undefined || access === 'public') {
        delete page.access
      } else if (access === 'member') {
        page.access = 'member'
      } else if (
        access && typeof access === 'object' &&
        (typeof (access as { role?: unknown }).role === 'string' ||
          (Array.isArray((access as { role?: unknown }).role) &&
            ((access as { role: unknown[] }).role).every((r) => typeof r === 'string')))
      ) {
        const role = (access as { role: string | string[] }).role
        page.access = { role: Array.isArray(role) ? [...role] : [role] }
      } else {
        throw new Error(
          `page "${page.name}" has invalid access ${JSON.stringify(access)} — want 'public', 'member' or { role: 'admin' | ['a', 'b'] }`,
        )
      }
      const redirect = nodeProps['redirect']
      if (redirect !== undefined) {
        if (typeof redirect !== 'string' || !redirect.trim()) {
          throw new Error(`page "${page.name}" redirect must be an address like 'login' or a URL`)
        }
        page.redirect = redirect.trim()
      }
    }
  }

  // Attach pages declared only via config.apps.<app>.pages (no compile action created them).
  for (const app of ir.apps.values()) {
    for (const pageName of app.pages) {
      if (!ir.pages.has(pageName)) {
        warnings.push(`app "${app.name}" lists unknown page "${pageName}"`)
      }
    }
  }
  // Pages referencing an app that was never declared get the app auto-created.
  for (const page of ir.pages.values()) {
    if (page.app && !ir.apps.has(page.app)) {
      ir.apps.set(page.app, { name: page.app, pages: [page.name] })
    }
  }

  const runtimeActions = scan.actions.filter((a) => !compileNames.has(a.name) && a.enabled !== false)
  const serverActions = runtimeActions.filter((a) => a.lane === 'server')
  const clientActions = runtimeActions.filter((a) => a.lane === 'client')
  const desktopActions = runtimeActions.filter((a) => a.lane === 'desktop')

  // Bindings are resolved against the compiled graph, so `on:` can be scoped to
  // an object and validated. This runs after the compile lane, which is why the
  // object ids are known by now.
  // Server objects: compiled before routes (an `on: 'object:…'` selector is
  // checked against them) and before pages render (every page's manifest
  // carries the browser's view of them).
  const serverObjects = await compileServerObjects(dir, (scan.config as { libraries?: string[] }).libraries ?? [], warnings)
  ir.serverObjects = browserObjectMeta(serverObjects)
  // Every build refreshes the project types, so the editor never lags the code.
  refreshProjectTypes({ dir, actionsDirs: opts.actionsDirs, fonts: Object.keys(scan.config.fonts ?? {}) }, serverObjects, warnings)

  const bindingErrors: string[] = []
  const objectErrors: string[] = []
  const graph = buildBindingGraph(ir, EMITTABLE)
  const { apis, triggers, bindings } = deriveRoutes(
    runtimeActions,
    (scan.config.hooks ?? []) as Array<{ on: string | string[]; run: string | string[]; when?: Record<string, unknown>; auth?: 'public' | 'member'; cors?: unknown; enabled?: boolean }>,
    graph,
    bindingErrors,
    { objects: serverObjects.map((o) => o.meta), errors: objectErrors },
  )
  // A misspelled object selector would be a trigger that never fires — a build error.
  if (objectErrors.length) throw new Error(objectErrors.join('\n'))
  // A selector naming a missing object, or an event nothing emits, is a mistake
  // worth surfacing — but not worth failing a build over, so it is a loud warning.
  warnings.push(...bindingErrors)
  // A render:'server' page no http route serves renders nothing per request —
  // its address falls through to the prerender. Almost always a missing
  // `on: 'http.get /<address>/'` on the owning action.
  for (const page of ir.pages.values()) {
    if (page.render !== 'server') continue
    const url = page.address === '/' ? '/' : `/${page.address}/`
    const owned = apis.some((r) => r.method === 'GET' && r.path.replace(/\/+$/g, '') === url.replace(/\/+$/g, ''));
    if (!owned) warnings.push(`page "${page.name}" renders per request but no GET route serves ${url} — it will serve its prerender`)
  }
  // The desktop lane ships its own partition: a desktop action's http routes
  // and triggers belong to dist/desktop/, not dist/server/. Partitioned here
  // — after derivation, so frontend bindings still resolve against the full
  // graph — by the lane of the action each entry runs.
  const laneOfAction = new Map(runtimeActions.map((a) => [a.name, a.lane]))
  const isDesktopRun = (name: string): boolean => laneOfAction.get(name) === 'desktop'
  const serverApis = apis.filter((r) => !isDesktopRun(r.action))
  const desktopApis = apis.filter((r) => isDesktopRun(r.action))
  const serverTriggers = triggers.filter((t) => !isDesktopRun(t.run))
  const desktopTriggers = triggers.filter((t) => isDesktopRun(t.run))

  const pages: Record<string, string> = {}
  for (const page of ir.pages.values()) {
    pages[page.name] = renderPageHtml(ir, page.name)
  }
  const customObjectsJs = await bundleCustomObjects(dir, discovered, minify)
  warnings.push(...customWarnings)
  const clientJs = await renderClientJs(
    dir,
    clientActions.map((a) => ({
      projectDir: dir,
      file: a.file,
      name: a.name,
      factory: a.factory,
    })),
    bindings,
    minify,
    customObjectsJs,
    // Every kind the project creates (row templates and components included):
    // the browser gets those kinds' code and no other.
    new Set([...ir.objects.values()].map((n) => n.kind)),
    // `config.debounce` / `config.throttle` on browser actions.
    Object.fromEntries(clientActions
      .filter((a) => a.debounce !== undefined || a.throttle !== undefined)
      .map((a) => [a.name, { ...(a.debounce !== undefined ? { debounce: a.debounce } : {}), ...(a.throttle !== undefined ? { throttle: a.throttle } : {}) }])),
  )
  const fonts = await resolveFonts({ dir, config: scan.config, warnings })
  ir.fontCss = fonts.css
  warnings.push(...unknownFontWords(ir))
  const css = minify ? await minifyCss(renderStyleCss(ir)) : renderStyleCss(ir)
  // The channel access action, generated from whatever `ctx.channels
  // .create(name, { permissions })` captured during the compile lane. Emitted alongside the real
  // server actions so it deploys, and runs, through exactly the same path — which
  // is what lets a permission function be ordinary action code with a real ctx.
  warnings.push(...accessModuleWarnings(ir.channels));
  const accessModule = emitAccessModule(ir.channels);

  const serverModules = await Promise.all(
    serverActions.map(async (a) => ({
      name: a.name,
      code: await bundleServerAction(
        {
          projectDir: dir,
          file: a.file,
          name: a.name,
          factory: a.factory,
          async: a.handlerAsync,
          minify,
        },
        // Node built-ins survive into the bundle and work under `morgana dev`,
        // so they can only be reported here — the compiler cannot tell whether
        // this project will be deployed.
        warnings,
      ),
    })),
  )

  // After the real ones, so a generated action can never shadow a user's.
  if (accessModule) serverModules.push(accessModule);

  // The desktop lane bundles with the Node profile and no builtin warning —
  // the app IS Node, so node:fs is the runtime rather than a deploy hazard.
  const desktopModules = await Promise.all(
    desktopActions.map(async (a) => ({
      name: a.name,
      code: await bundleDesktopAction({
        projectDir: dir,
        file: a.file,
        name: a.name,
        factory: a.factory,
        async: a.handlerAsync,
        minify,
      }),
    })),
  )

  const names = Object.keys(pages)
  const entry = scan.config.entry && names.includes(scan.config.entry)
    ? scan.config.entry
    : names.includes('home')
      ? 'home'
      : (names[0] ?? '')
  if (scan.config.entry && !names.includes(scan.config.entry)) {
    warnings.push(`config entry "${scan.config.entry}" matches no compiled page`)
  }

  // Server objects are discovered for the object pipeline — cloud and
  // desktop both read dist/objects.json, and only the desktop host runs the
  // local object runtime in v1. Emitted only when the project declares
  // objects, so a project with none builds byte-identically to before.
  const objectWarnings: string[] = []
  const discoveredObjects = discoverServerObjects(dir, objectWarnings)
  warnings.push(...objectWarnings)
  const desktopDecl = buildDesktopDecl(scan.config, desktopActions, warnings)

  const emitted = emitDist(outDir, {
    ir,
    entry,
    assetsDir: (() => {
      try {
        const candidate = path.join(dir, 'assets')
        return fs.statSync(candidate).isDirectory() ? candidate : null
      } catch {
        return null
      }
    })(),
    extraAssets: [...fonts.files, ...(artifactBuild?.files ?? [])],
    pages,
    clientJs,
    css,
    serverActions: serverModules,
    apis: serverApis,
    triggers: serverTriggers,
    warnings,
    minify,
    customObjects: discovered,
    vars: (scan.config.vars?.public ?? {}) as Record<string, unknown>,
    // Channels declared during the compile lane, with their access rules. This
    // is `ir.channels` rather than anything in the config: a channel is declared
    // where it is created, the same place its shape and scope are.
    channels: Object.fromEntries(ir.channels),
    desktopActions: desktopModules,
    desktopApis,
    desktopTriggers,
    desktop: desktopDecl,
    serverObjects: discoveredObjects,
    objects: serverObjects,
  })

  return {
    ...emitted,
    pages: names,
    customObjects: discovered.map((d) => d.name),
    entry,
    serverActions: serverModules.map((m) => m.name),
    desktopActions: desktopModules.map((m) => m.name),
    compileActions: compileActions.map((a) => a.name),
    warnings,
    minify,
    ir,
    ...(artifactBuild ? { artifacts: artifactBuild.artifacts, artifactsBuilt: artifactBuild.built } : {}),
  }
}

export { scanProject } from './extract'
export { buildArtifacts, loadPlugins, resolveArtifactRefs } from './plugins'
export type { ArtifactBuild, LoadedPlugin } from './plugins'
export { generateTypes } from './types'
export { buildSpec, renderAllSpecs, renderSpec, specTopics } from './spec'
export type { SpecDoc, SpecMember, SpecSection } from './spec'
export type { GenerateTypesOptions, GeneratedTypes } from './types'
export type { SdkActionMeta } from './extract'
export type { ProjectIR } from './ir'
export type { ObjNode, PageNode } from './ir'
// Request-time rendering for `render: 'server'` pages — the host imports
// these, users never do.
export { createServerUi, isPageResult, pageResult } from './server-render'
export type { ServerRenderCtx, ServerRenderDeps } from './server-render'
export { extractPageGraph, hydratePageGraph } from './render/page-graph'
export type { PageGraphJson } from './render/page-graph'
export { renderPageHtml } from './render/page'
export { renderNode } from './render/node'
export { resolveMakeToken } from './compile-ctx/tokens'
