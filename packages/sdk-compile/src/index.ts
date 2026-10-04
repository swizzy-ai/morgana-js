/**
 * Orchestration — scan → run compile lane → lower → emit.
 *
 * Compile handlers run in Node against the recording ctx. They are real
 * modules: `bundle.ts` resolves their import graph with esbuild and hands back
 * a callable, so a compile action may import siblings, shared helpers and
 * third-party packages. Runtime-only APIs on the ctx still throw.
 */

import fs from 'node:fs'
import path from 'node:path'
import type { AppDefinition, CustomObjectDefinition, MorganaConfig } from '@morgana/sdk'
import { hookRunsFor, scanProject, type SdkActionMeta } from './extract'
import {
  discoverCustomObjects,
  loadCustomObjectDefinitions,
  bundleCustomObjects,
} from './custom-objects'
import { createEmptyIR, type ProjectIR } from './ir'
import {
  buildBrowserCompileCtx,
  buildServerCompileCtx,
  createCompileState,
  type CompileState,
} from './compile-ctx'
import { bundleBrowserActions, bundleCompileAction, bundleServerAction } from './bundle'
import { renderClientJs } from './client'
import { deriveRoutes, EMITTABLE } from './routes'
import { buildBindingGraph } from './bindings'
import { renderPageHtml } from './render/page'
import { renderStyleCss } from './style/sheet'
import { ACCESS_ACTION, accessModuleWarnings, emitAccessModule } from './access'
import { emitDist, type EmitResult } from './emit'
import { minifyCss } from './style/minify'

export interface CompileOptions {
  dir: string
  outDir?: string
  actionsDirs?: string[]
  /** Minify emitted JS. Overrides `minify` in morgana.config.ts. */
  minify?: boolean
}

export interface CompileResult extends EmitResult {
  pages: string[]
  /** Custom object components this project ships. */
  customObjects: string[]
  /** The default page: config.entry when it names a real page, else home, else first. */
  entry: string
  serverActions: string[]
  compileActions: string[]
  warnings: string[]
  /** Whether JS and CSS were minified — the resolved value, not the request. */
  minify: boolean
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

export async function compileProject(opts: CompileOptions): Promise<CompileResult> {
  const dir = path.resolve(opts.dir)
  const outDir = path.resolve(opts.outDir ?? path.join(dir, 'dist'))
  const scan = scanProject({ dir, actionsDirs: opts.actionsDirs })
  const warnings: string[] = [...scan.warnings]
  // A call-site flag wins over the config, which wins over the readable default.
  const minify = opts.minify ?? scan.config.minify ?? false

  const ir = createEmptyIR()
  seedFromConfig(ir, scan.config)

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
      throw new Error(`compile action "${meta.name}" failed — ${err instanceof Error ? err.message : String(err)}`)
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

  // Bindings are resolved against the compiled graph, so `on:` can be scoped to
  // an object and validated. This runs after the compile lane, which is why the
  // object ids are known by now.
  const bindingErrors: string[] = []
  const graph = buildBindingGraph(ir, EMITTABLE)
  const { apis, triggers, bindings } = deriveRoutes(
    runtimeActions,
    (scan.config.hooks ?? []) as Array<{ on: string | string[]; run: string | string[]; when?: Record<string, unknown>; auth?: 'public' | 'member'; cors?: unknown; enabled?: boolean }>,
    graph,
    bindingErrors,
  )
  // A selector naming a missing object, or an event nothing emits, is a mistake
  // worth surfacing — but not worth failing a build over, so it is a loud warning.
  warnings.push(...bindingErrors)

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
  )
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

  const names = Object.keys(pages)
  const entry = scan.config.entry && names.includes(scan.config.entry)
    ? scan.config.entry
    : names.includes('home')
      ? 'home'
      : (names[0] ?? '')
  if (scan.config.entry && !names.includes(scan.config.entry)) {
    warnings.push(`config entry "${scan.config.entry}" matches no compiled page`)
  }

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
    pages,
    clientJs,
    css,
    serverActions: serverModules,
    apis,
    triggers,
    warnings,
    minify,
    customObjects: discovered,
    vars: (scan.config.vars?.public ?? {}) as Record<string, unknown>,
    // Channels declared during the compile lane, with their access rules. This
    // is `ir.channels` rather than anything in the config: a channel is declared
    // where it is created, the same place its shape and scope are.
    channels: Object.fromEntries(ir.channels),
  })

  return {
    ...emitted,
    pages: names,
    customObjects: discovered.map((d) => d.name),
    entry,
    serverActions: serverModules.map((m) => m.name),
    compileActions: compileActions.map((a) => a.name),
    warnings,
    minify,
  }
}

export { scanProject } from './extract'
export type { SdkActionMeta } from './extract'
export type { ProjectIR } from './ir'
