#!/usr/bin/env node
/**
 * desktop-lane.mjs — the desktop lane, authored in ONE file, applied in ONE run.
 *
 * WHAT THIS IS
 *   Every code change for the desktop lane lives in this file as data:
 *   - FILES: complete new files (path + full content + why)
 *   - EDITS: surgical changes to existing files (file + exact anchor + code + why)
 *   Run it once and it writes everything into its right file.
 *
 * USAGE
 *   node desktop-lane.mjs              apply all pending changes
 *   node desktop-lane.mjs --dry-run    print what would change, touch nothing
 *   node desktop-lane.mjs --status      show applied vs pending per item
 *   node desktop-lane.mjs --force      overwrite files whose content differs
 *                                      (default: abort on conflict, never clobber
 *                                      your review edits)
 *
 * GUARANTEES
 *   - An edit applies only when its anchor matches EXACTLY ONCE. Zero matches
 *     or two matches = the item fails loudly and nothing is half-written.
 *   - Re-running is safe: items whose code is already present are skipped.
 *   - A file carrying composed EDITS reports 'composed' and is never
 *     overwritten, even under --force: the EDITS own that delta. Folding a
 *     composed delta back into its FILES entry is a separate script edit.
 *   - No entry may target lines inside another entry's code: the inner edit
 *     breaks the outer entry's idempotency check and it re-applies as a
 *     duplicate. Compose by folding into the outer entry, or delete the
 *     superseded entry (history lives in git).
 *   - Fixes go INTO THIS FILE first, then re-run. This file is the source of
 *     truth, not the working tree.
 *
 * AFTER RUNNING (in this order)
 *   pnpm install                          # new workspace package
 *   pnpm --filter @morgana/sdk build && pnpm --filter @morgana/sdk typecheck
 *   pnpm --filter @morgana/sdk-compile build && pnpm --filter @morgana/sdk-compile typecheck
 *   pnpm --filter @morgana/cli build && pnpm --filter @morgana/cli typecheck
 *   pnpm --filter @morgana/desktop-electron build && pnpm --filter @morgana/desktop-electron typecheck
 *   pnpm -r test                           # 506 tests + the new ones
 *   node examples/sdk-compile-demo/build.mjs   # demo gains a desktop action
 */

// ═══════════════════════════════════════════════════════════════════════════
//  YOUR COMMENTS — write anything here. The runner never reads this block.
//  Per-item notes live on each entry's `note` field (default ''). Examples:
//    // TODO: dont ship notify in v1
//    // CHANGE: drop the shell group until we have a real use case
//    // SKIP: E34 — cloud team owns the manifest
// ═══════════════════════════════════════════════════════════════════════════
const REVIEW_NOTES = `
(write review comments here — they travel with the file)
`

const FILES = [
  {
    id: 'F1',
    path: 'packages/sdk/src/contexts/desktop.ts',
    why: 'The desktop lane types. DesktopContext extends ServerContext (approved call #1: the installed app is a host, so it keeps the whole server spine) and adds ctx.desktop with os/app/objects. There is deliberately no ctx.os on the shared base — an unscoped name would be reachable from the client lane, where there is no machine to talk to.',
    note: '',
    content: `/**
 * The desktop lane — \`ctx.desktop\`.
 *
 * A desktop action runs inside the installed app, not in the cloud. It keeps
 * the whole server spine — collections, files, queue, events, vars — because
 * the app is a host, not a page: the same action code must work whether the
 * host is a laptop or a datacenter. What it adds is \`ctx.desktop\`:
 *
 *   os      — the machine, behind declared capability groups (fs, clipboard,
 *             notify, shell). A group the config did not declare throws a
 *             named error instead of returning undefined.
 *   app     — the installed app's identity (bundle id, version, data dir).
 *   objects — the local object runtime (types/create/get/run over
 *             dist/objects.json, persisted beside the app data).
 *
 * There is deliberately no \`ctx.os\` on the shared base: an unscoped name
 * would be reachable from the client lane, where there is no machine to talk
 * to. Scoped to \`ctx.desktop\`, the type system itself refuses it elsewhere.
 */

import type { ActionContract } from '../contracts'
import type { BaseContext } from './base'
import type { ServerContext, ServerApi } from './server'
import type { ServerObjectInstanceHandle } from './server-object'

/** Capability groups a desktop backend implements in v1. */
export type DesktopOsGroup = 'fs' | 'clipboard' | 'notify' | 'shell' | 'dialog' | 'window'

/** Sandboxed file access, rooted in the app's own data directory. */
export interface DesktopOsFs {
  readFile(path: string): Promise<string | Uint8Array | null>
  writeFile(path: string, data: string | Uint8Array): Promise<void>
  exists(path: string): Promise<boolean>
  list(dir?: string): Promise<string[]>
  remove(path: string): Promise<boolean>
  /** Absolute, writable per-app directory the backend owns. */
  dataDir: string
}

export interface DesktopOsClipboard {
  read(): Promise<string>
  write(text: string): Promise<void>
}

export interface DesktopOsNotify {
  show(title: string, body?: string): Promise<void>
}

export interface DesktopOsShell {
  openPath(path: string): Promise<string>
  openUrl(url: string): Promise<void>
}

/** Native dialogs. Every picker resolves null when the user cancels. */
export interface DesktopOsDialog {
  openFiles(opts?: { title?: string; dir?: string; multi?: boolean }): Promise<string[] | null>
  saveFile(opts?: { title?: string; dir?: string; name?: string }): Promise<string | null>
  message(opts: { title: string; body: string; kind?: 'info' | 'warn' | 'error' }): Promise<void>
}

/**
 * Full window control. This is swizzy's surface (minimize/close/drag/focus)
 * plus the obvious beyond (maximize/fullscreen/bounds/title/visibility).
 * Drag deltas are clamped to the work area by the backend, so a fling can
 * never strand the window off-screen.
 */
export interface DesktopOsWindow {
  minimize(): Promise<void>
  maximize(): Promise<void>
  unmaximize(): Promise<void>
  isMaximized(): Promise<boolean>
  close(): Promise<void>
  hide(): Promise<void>
  show(): Promise<void>
  focus(): Promise<void>
  isVisible(): Promise<boolean>
  setTitle(title: string): Promise<void>
  getBounds(): Promise<{ x: number; y: number; width: number; height: number }>
  setBounds(bounds: { x?: number; y?: number; width?: number; height?: number }): Promise<void>
  center(): Promise<void>
  fullscreen(on: boolean): Promise<void>
  isFullscreen(): Promise<boolean>
  setAlwaysOnTop(on: boolean): Promise<void>
  drag(dx: number, dy: number): Promise<void>
}

/** The machine, behind declared capability groups. */
export interface DesktopOsHandle {
  platform: string
  arch: string
  fs: DesktopOsFs
  clipboard: DesktopOsClipboard
  notify: DesktopOsNotify
  shell: DesktopOsShell
  dialog: DesktopOsDialog
  window: DesktopOsWindow
}

/** The installed app's identity, from dist/desktop/app.json + the backend. */
export interface DesktopAppInfo {
  name: string
  bundleId: string
  version: string
  userDataPath: string
  isPackaged: boolean
}

export interface DesktopObjectTypeDef {
  name: string
  shape: unknown
  ops: string[]
}

export interface DesktopObjectInstance {
  id: string
  type: string
  state: Record<string, unknown>
}

/**
 * The local object runtime.
 *
 * \`run\` returns the op's return value and persists NOTHING by itself —
 * persistence happens only through \`ctx.object.set()\` inside the op or
 * \`set()\` outside it. A computed value that nobody stores is just a value,
 * and silently writing it back would make every read a write.
 */
export interface DesktopObjectsHandle {
  types(): Promise<DesktopObjectTypeDef[]>
  type(name: string): Promise<DesktopObjectTypeDef | null>
  create(type: string, props?: Record<string, unknown>): Promise<DesktopObjectInstance>
  get(type: string, id: string): Promise<DesktopObjectInstance | null>
  run(type: string, id: string, op: string, params?: Record<string, unknown>): Promise<unknown>
  set(type: string, id: string, patch: Record<string, unknown>): Promise<DesktopObjectInstance>
  remove(type: string, id: string): Promise<boolean>
}

export interface DesktopApi {
  os: DesktopOsHandle
  app: DesktopAppInfo
  objects: DesktopObjectsHandle
}

/**
 * The desktop action context — the shared base, every server concern on
 * \`ctx.server\`, plus \`ctx.desktop\`. \`C\` is the action's own Contract.
 */
export interface DesktopContext<C extends ActionContract = ActionContract> extends ServerContext<C> {
  /** Every desktop concern: os capabilities, app identity, local objects. */
  desktop: DesktopApi
}

/**
 * What a desktop object op actually receives on v1.
 *
 * Deliberately NOT the full ServerObjectContext: there is no storage spine
 * behind it here (no ctx.server), so the type promises exactly what exists —
 * args, params, this instance, ctx.desktop, log, vars. An op that needs
 * collections is a cloud op; typing it as one keeps that honest instead of
 * failing at runtime with undefined.
 */
export interface DesktopObjectOpContext extends BaseContext {
  object: ServerObjectInstanceHandle
  desktop: DesktopApi
  args: Record<string, unknown>
  params: Record<string, unknown>
}

/** Re-exported so backends build the throwing spine without new imports. */
export type { ServerApi }
`,
  },
  {
    id: 'F2',
    path: 'packages/sdk/src/__tests__/desktop.test.ts',
    why: 'SDK-side proof the factory is an identity helper and DesktopContext carries both the server spine and ctx.desktop. Type-level: if the context shape drifts, tsc fails here first.',
    note: '',
    content: `import { describe, expect, it } from 'vitest'
import { defineDesktopAction } from '../actions'
import type { DesktopContext } from '../contexts/desktop'
import type { ServerContext } from '../contexts/server'

describe('defineDesktopAction', () => {
  it('is an identity helper over config + handler', () => {
    const action = defineDesktopAction({
      config: { on: 'cron(* * * * *)' },
      handler: (ctx) => {
        void ctx.desktop.os.platform
        void ctx.desktop.app.bundleId
        void ctx.desktop.objects
        void ctx.desktop.os.dialog
        void ctx.desktop.os.window
        void ctx.server.collections
        return { ok: true }
      },
    })
    expect(action.config?.on).toBe('cron(* * * * *)')
    expect(typeof action.handler).toBe('function')
  })

  it('a DesktopContext is a ServerContext with ctx.desktop', () => {
    // Compile-time only: assignability proves the inheritance. Nothing runs,
    // so nothing can throw — the assertion is that this file typechecks.
    const ctx = null as unknown as DesktopContext
    const check: ServerContext = ctx
    expect(check).toBe(null)
  })
})
`,
  },
  {
    id: 'F3',
    path: 'packages/sdk-compile/src/__tests__/desktop.test.ts',
    why: 'Compiler-side proof for the lane: detection (factory + desktop dir), the dist/desktop partition with a clean server side, the no-lane regression (byte-identical output, no manifest key), and object op-source extraction (arrow + method + shorthand + import-use warning).',
    note: '',
    content: `/**
 * The desktop lane — detection, partition, and the desktop dist contract.
 *
 * A desktop action is detected by factory (defineDesktopAction) or by folder
 * (actions/desktop/). It bundles with the Node profile and ships to
 * dist/desktop/ — http routes and triggers partitioned out of the server
 * files, so the cloud never sees them. A project without the lane builds
 * exactly as before: no dist/desktop/, no manifest key, same hash inputs.
 */
import fs from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { compileProject } from '../index'
import { scanProject } from '../extract'

const CONFIG = [
  "import { defineConfig } from '@morgana/sdk'",
  'export default defineConfig({',
  "  name: 'desk-demo',",
  "  entry: 'home',",
  "  desktop: { os: ['clipboard'] },",
  '  apps: {',
  "    shop: { displayName: 'Shop', type: 'desktop', platform: { bundleId: 'com.morgana.shop' }, pages: ['home'], window: { width: 1128, height: 792, frameless: true } },",
  '  },',
  '})',
].join('\\n')

const SEED = [
  "import { defineClientAction } from '@morgana/sdk'",
  'export const seed = defineClientAction({',
  '  config: { on: "compile" },',
  '  handler: (ctx) => {',
  "    ctx.ui.pages.create({ name: 'home', address: '/' })",
  '    return { ok: true }',
  '  },',
  '})',
].join('\\n')

const PING = [
  "import { defineDesktopAction } from '@morgana/sdk'",
  'export const ping = defineDesktopAction({',
  "  config: { on: 'http.get /ping', auth: 'public' },",
  '  handler: (ctx) => ({ ok: true, platform: ctx.desktop.os.platform }),',
  '})',
].join('\\n')

const PONG = [
  "import { defineDesktopAction } from '@morgana/sdk'",
  'export const pong = defineDesktopAction({',
  "  config: { on: 'cron(* * * * *)' },",
  '  handler: () => ({ ok: true }),',
  '})',
].join('\\n')

const PLAIN = [
  'export async function handle(ctx) {',
  '  return { ok: true, via: "folder" }',
  '}',
].join('\\n')

const GREET = [
  "import { defineServerAction } from '@morgana/sdk'",
  'export const greet = defineServerAction({',
  '  handler: () => ({ greeting: "hi" }),',
  '})',
].join('\\n')

const FMT = [
  'export function fmt(n: number): string {',
  '  return "n=" + n',
  '}',
].join('\\n')

const COUNTER = [
  "import { customServerObject } from '@morgana/sdk'",
  "import { fmt } from './fmt'",
  '',
  'async function total(ctx: any, p: any): Promise<any> {',
  '  return { total: 1 }',
  '}',
  '',
  'export default customServerObject({',
  "  name: 'counter',",
  '  shape: { columns: [{ name: "count", type: "number" }] },',
  '  ops: {',
  '    get: async (ctx: any): Promise<any> => ({ count: (ctx.object.state.count as number) ?? 0 }),',
  '    incr(ctx: any, p: any): any {',
  '      return { count: ((ctx.object.state.count as number) ?? 0) + Number((p as any).by ?? 1) }',
  '    },',
  '    total,',
  '    bad: async (ctx: any): Promise<any> => ({ v: fmt((ctx.object.state.count as number) ?? 0) }),',
  '  },',
  '})',
].join('\\n')

const CONFIG_NODESK = [
  "import { defineConfig } from '@morgana/sdk'",
  'export default defineConfig({',
  "  name: 'desk-demo',",
  "  entry: 'home',",
  '})',
].join('\\n')

function writeProject(files: Record<string, string>, config: string = CONFIG): string {
  const dir = fs.mkdtempSync(path.join(tmpdir(), 'morgana-desk-'))
  const write = (rel: string, text: string): void => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    fs.writeFileSync(path.join(dir, rel), text, 'utf8')
  }
  write('morgana.config.ts', config)
  write('src/actions/compile/seed.ts', SEED)
  for (const [rel, text] of Object.entries(files)) write(rel, text)
  return dir
}

describe('desktop lane detection', () => {
  it('a defineDesktopAction file is lane desktop', () => {
    const dir = writeProject({ 'src/actions/desktop/ping.ts': PING })
    try {
      const scan = scanProject({ dir })
      expect(scan.actions.map((a) => [a.name, a.lane])).toContainEqual(['ping', 'desktop'])
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('a plain handler under actions/desktop/ is lane desktop', () => {
    const dir = writeProject({ 'src/actions/desktop/plain.ts': PLAIN })
    try {
      const scan = scanProject({ dir })
      const plain = scan.actions.find((a) => a.name === 'plain')
      expect(plain?.lane).toBe('desktop')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('desktop dist partition', () => {
  it('emits dist/desktop/* and keeps the server partition clean', async () => {
    const dir = writeProject({
      'src/actions/desktop/ping.ts': PING,
      'src/actions/desktop/pong.ts': PONG,
      'src/actions/server/greet.ts': GREET,
    })
    try {
      const result = await compileProject({ dir, outDir: path.join(dir, 'dist') })
      expect(result.desktopActions.sort()).toEqual(['ping', 'pong'])
      // The modules land in the desktop partition, never in the server one.
      expect(fs.existsSync(path.join(dir, 'dist', 'desktop', 'actions', 'ping.js'))).toBe(true)
      expect(fs.existsSync(path.join(dir, 'dist', 'server', 'actions', 'ping.js'))).toBe(false)
      expect(fs.existsSync(path.join(dir, 'dist', 'server', 'actions', 'greet.js'))).toBe(true)
      // Routes and triggers are partitioned by the lane of the action they run.
      const desktopApis = JSON.parse(fs.readFileSync(path.join(dir, 'dist', 'desktop', 'apis.json'), 'utf8'))
      expect(desktopApis.map((r: { path: string }) => r.path)).toContain('/ping')
      const serverApis = JSON.parse(fs.readFileSync(path.join(dir, 'dist', 'server', 'apis.json'), 'utf8'))
      expect(serverApis.map((r: { path: string }) => r.path)).not.toContain('/ping')
      const desktopTriggers = JSON.parse(fs.readFileSync(path.join(dir, 'dist', 'desktop', 'triggers.json'), 'utf8'))
      expect(desktopTriggers.map((t: { run: string }) => t.run)).toContain('pong')
      const serverTriggers = JSON.parse(fs.readFileSync(path.join(dir, 'dist', 'server', 'triggers.json'), 'utf8'))
      expect(serverTriggers.map((t: { run: string }) => t.run)).not.toContain('pong')
      // The manifest names desktop actions separately — the cloud deploys
      // \`actions\` and must never see this list.
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'dist', 'manifest.json'), 'utf8'))
      expect(manifest.desktopActions.sort()).toEqual(['ping', 'pong'])
      expect(manifest.actions).toContain('greet')
      expect(manifest.actions).not.toContain('ping')
      // The desktop declaration carries backend, capabilities and identity.
      const appJson = JSON.parse(fs.readFileSync(path.join(dir, 'dist', 'desktop', 'app.json'), 'utf8'))
      expect(appJson.backend).toBe('@morgana/desktop-electron')
      expect(appJson.os).toEqual(['clipboard'])
      expect(appJson.apps.map((a: { bundleId: string }) => a.bundleId)).toContain('com.morgana.shop')
      expect(appJson.apps.find((a: { bundleId: string }) => a.bundleId === 'com.morgana.shop').window).toMatchObject({ width: 1128, frameless: true })
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)

  it('a project without the lane builds no dist/desktop and no manifest key', async () => {
    // No desktop key anywhere in this config: no actions, no declaration,
    // so the lane must leave zero trace.
    const dir = writeProject({ 'src/actions/server/greet.ts': GREET }, CONFIG_NODESK)
    try {
      await compileProject({ dir, outDir: path.join(dir, 'dist') })
      expect(fs.existsSync(path.join(dir, 'dist', 'desktop'))).toBe(false)
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'dist', 'manifest.json'), 'utf8'))
      expect('desktopActions' in manifest).toBe(false)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)
})

describe('object op source', () => {
  it('ships standalone runnable source per op and warns on imports', async () => {
    const dir = writeProject({
      'src/server-objects/counter.ts': COUNTER,
      'src/server-objects/fmt.ts': FMT,
    })
    try {
      const result = await compileProject({ dir, outDir: path.join(dir, 'dist') })
      const objects = JSON.parse(fs.readFileSync(path.join(dir, 'dist', 'objects.json'), 'utf8'))
      const counter = objects.find((o: { name: string }) => o.name === 'counter')
      // Arrow, method shorthand and shorthand-reference all ship as plain-JS
      // expressions — every one of them compiles with plain new Function.
      for (const name of ['get', 'incr', 'total', 'bad']) {
        const src: string = counter.opSrc[name]
        expect(typeof src, name).toBe('string')
        expect(src).not.toMatch(/:\\s*any/)
        const fn = new Function('return (' + src + ')')() as (...a: unknown[]) => unknown
        expect(typeof fn, name).toBe('function')
      }
      // The method form still computes once compiled. (The fixture method is
      // sync, so this asserts the value, not a promise.)
      const incr = new Function('return (' + counter.opSrc.incr + ')')() as (ctx: unknown, p: unknown) => unknown
      expect(incr({ object: { state: { count: 2 } } }, { by: 3 })).toEqual({ count: 5 })
      // The op using the imported helper is named, not silently broken.
      expect(result.warnings.join('\\n')).toContain('"bad"')
      expect(result.warnings.join('\\n')).toContain('"fmt"')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)
})
`,
  },
  {
    id: 'F4',
    path: 'packages/morgana-cli/src/host.mjs',
    why: 'Library entry for backend packages (tsup builds it to dist/host.js, exported as @morgana/cli/host). The desktop backend boots the app through dev(), fires declarative cron through CronScheduler, and builds nothing itself — one host, not two that happen to agree.',
    note: '',
    content: `/**
 * Host library entry — the reference host as an importable module.
 *
 * The CLI binary bundles \`bin/morgana.mjs\`; this entry exists for backend
 * packages (desktop-electron first). It re-exports the pieces a backend needs
 * to boot the app: \`dev()\` serves dist/ and runs actions, the CronScheduler
 * fires declarative schedules, the store engine and channel hub are here for
 * tooling. Nothing in this file knows about windows or installers — the
 * backend owns those, the host owns the project runtime.
 */
export { dev } from './commands/dev.mjs'
export { makeHostContext } from './lib/host-context.mjs'
export { CronScheduler, isValidCronExpression, cronMatchesAt } from './lib/cron.mjs'
export { StoreEngine } from './lib/store.mjs'
export { ChannelHub } from './lib/channels.mjs'
`,
  },
  {
    id: 'F5',
    path: 'packages/morgana-cli/src/commands/desktop.mjs',
    why: '`morgana desktop` opens the app — it runs it. Compiles, then hands the project to the backend run(): host boots with backend-built ctx.desktop, desktop cron schedules, window opens. Building without running is `morgana package` (F21) — this command always runs. Backend loader lives in desktop-backend.mjs (F22), shared with package.',
    note: '',
    content: `/**
 * \`morgana desktop\` — open the app. It runs it.
 *
 * Compiles, then hands the project to the configured backend's run(): the
 * host boots with a backend-built ctx.desktop, desktop cron schedules, and
 * the window opens on the loopback host. Building without running is
 * \`morgana package\` — this command always runs.
 */
import path from 'node:path'
import { scanProject } from '@morgana/sdk-compile'
import { build } from './build.mjs'
import { loadBackend, DEFAULT_BACKEND } from './desktop-backend.mjs'
import { say } from '../ui.mjs'

export async function desktop({ dir = process.cwd(), port = 4317, minify } = {}) {
  const projectDir = path.resolve(dir)
  const scan = scanProject({ dir: projectDir })
  const backendName = scan.config.desktop?.backend ?? DEFAULT_BACKEND
  const backend = await loadBackend(projectDir, backendName)
  await build({ dir: projectDir, minify })
  if (typeof backend.run !== 'function') {
    throw new Error('desktop backend "' + backendName + '" exports no run() — it cannot open the app')
  }
  say('desktop backend: ' + backendName)
  await backend.run({ dir: projectDir, port })
}
`,
  },
  {
    id: 'F6',
    path: 'packages/morgana-cli/src/__tests__/desktop-host.test.mjs',
    why: 'End-to-end proof on the reference host: a compiled desktop action is served over the desktop http partition and runs with a real ctx.desktop, dispatched through the same runAction path as every other action.',
    note: '',
    content: `/**
 * The desktop lane on the reference host.
 *
 * Compiles a tiny project with a desktop action, boots dev() with a
 * backend-built ctx.desktop (opaque to the host, exactly as Electron builds
 * it), and proves the action runs through both doors: direct invocation and
 * its http route from the desktop partition.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { compileProject } from '@morgana/sdk-compile'
import { dev } from '../commands/dev.mjs'

const CONFIG = [
  "import { defineConfig } from '@morgana/sdk'",
  'export default defineConfig({',
  "  name: 'host-desk',",
  "  entry: 'home',",
  "  desktop: { os: ['clipboard'] },",
  '})',
].join('\\n')

const SEED = [
  "import { defineClientAction } from '@morgana/sdk'",
  'export const seed = defineClientAction({',
  '  config: { on: "compile" },',
  '  handler: (ctx) => {',
  "    ctx.ui.pages.create({ name: 'home', address: '/' })",
  '    return { ok: true }',
  '  },',
  '})',
].join('\\n')

const PING = [
  "import { defineDesktopAction } from '@morgana/sdk'",
  'export const ping = defineDesktopAction({',
  "  config: { on: 'http.get /ping', auth: 'public' },",
  '  handler: async (ctx) => ({ ok: true, platform: ctx.desktop.os.platform, app: ctx.desktop.app.name }),',
  '})',
].join('\\n')

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'morgana-host-desk-'))
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    fs.writeFileSync(path.join(dir, rel), text, 'utf8')
  }
  write('morgana.config.ts', CONFIG)
  write('src/actions/compile/seed.ts', SEED)
  write('src/actions/desktop/ping.ts', PING)
  return dir
}

// Windows holds the SQLite file until the engine is GC'd, so cleanup retries
// briefly and then leaves the temp dir behind with a warning rather than
// failing the test — the assertions already ran, and failing here would test
// the OS, not the lane.
async function rmRetry(dir) {
  for (let i = 0; i < 5; i++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
      return
    } catch (err) {
      if (i === 4) {
        console.warn('leaving temp dir behind: ' + dir + ' (' + (err?.message ?? err) + ')')
        return
      }
      await new Promise((r) => setTimeout(r, 100))
    }
  }
}

describe('desktop lane on the reference host', () => {
  it('serves the desktop route and runs the action with ctx.desktop', async () => {
    const dir = fixture()
    const prevData = process.env.MORGANA_DATA
    process.env.MORGANA_DATA = path.join(dir, '.data')
    try {
      await compileProject({ dir, outDir: path.join(dir, 'dist') })
      // Built by "the backend" — the host carries it verbatim and never
      // inspects it, which is exactly the contract electron relies on.
      const desktop = {
        os: { platform: 'test-os', arch: 'test-arch' },
        app: { name: 'host-desk', bundleId: 'com.test.desk', version: '0.0.0', userDataPath: dir, isPackaged: false },
        objects: {},
      }
      const handle = await dev({ dir, port: 0, desktop })
      const addr = handle.server.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      expect(port).toBeGreaterThan(0)

      // Door 1: direct invocation.
      const invoked = await fetch('http://127.0.0.1:' + port + '/api/actions/ping/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ params: {} }),
      })
      const invokedBody = await invoked.json()
      expect(invokedBody.success).toBe(true)
      expect(invokedBody.data.result).toMatchObject({ ok: true, platform: 'test-os', app: 'host-desk' })

      // Door 2: the http route from the desktop partition.
      const routed = await fetch('http://127.0.0.1:' + port + '/ping')
      const routedBody = await routed.json()
      expect(routedBody.success).toBe(true)
      expect(routedBody.data.result.platform).toBe('test-os')

      handle.server.closeAllConnections()
      // Manual close, not handle.shutdown(): shutdown() ends in
      // process.exit and belongs to real processes, not test workers.
      await new Promise((resolve) => handle.server.close(resolve))
    } finally {
      if (prevData === undefined) delete process.env.MORGANA_DATA
      else process.env.MORGANA_DATA = prevData
      await rmRetry(dir)
    }
  }, 60_000)
})
`,
  },
  {
    id: 'F7',
    path: 'packages/desktop-electron/package.json',
    why: 'New public workspace package (approved call #2). Runtime deps are only cli (host library) and sdk (types); electron is a devDep — needed to run, never imported by unit tests. electron-builder stays OUT of devDeps (heavy toolchain, only needed for pack mode package); pack.ts names the install when it is missing. pnpm-workspace.yaml gains the entry in E52.',
    note: 'ELECTRON VERSION — bump these two pins to current before release.',
    content: `{
  "name": "@morgana/desktop-electron",
  "version": "0.1.0",
  "type": "module",
  "description": "Desktop backend for Morgana — boots dist/desktop/ in Electron: window, os capabilities, local object runtime, installer project.",
  "license": "Apache-2.0",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/SwizzyAI/morgana-js.git",
    "directory": "packages/desktop-electron"
  },
  "homepage": "https://github.com/SwizzyAI/morgana-js/tree/main/packages/desktop-electron#readme",
  "bugs": {
    "url": "https://github.com/SwizzyAI/morgana-js/issues"
  },
  "keywords": [
    "morgana",
    "desktop",
    "electron"
  ],
  "publishConfig": {
    "access": "public"
  },
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./package.json": "./package.json"
  },
  "files": [
    "dist"
  ],
  "sideEffects": false,
  "engines": {
    "node": ">=22.12.0"
  },
  "scripts": {
    "build": "tsup",
    "lint": "tsc --noEmit",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@morgana/cli": "workspace:^",
    "@morgana/sdk": "workspace:^"
  },
  "devDependencies": {
    "@types/node": "^22.14.0",
    "electron": "^33.0.0",
    "tsup": "^8.5.1",
    "typescript": "~5.8.2",
    "vitest": "^4.1.10"
  }
}
`,
  },
  {
    id: 'F8',
    path: 'packages/desktop-electron/tsconfig.json',
    why: 'Mirrors sdk-compile tsconfig (paths to SDK source). Nothing here imports electron statically on purpose — see F12 — so typecheck passes with only node types.',
    note: '',
    content: `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "noUncheckedIndexedAccess": false,
    "paths": {
      "@morgana/sdk": ["../sdk/src/index.ts"],
      "@morgana/sdk/*": ["../sdk/src/*"]
    }
  },
  "include": ["src"]
}
`,
  },
  {
    id: 'F9',
    path: 'packages/desktop-electron/tsup.config.ts',
    why: 'Builds the backend to dist/index.js (+d.ts). electron/electron-builder/cli stay external — they resolve from the installed package at runtime, never inlined.',
    note: '',
    content: `import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { index: 'src/index.ts' },
  outDir: 'dist',
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  bundle: true,
  splitting: false,
  clean: true,
  sourcemap: false,
  dts: true,
  treeshake: true,
  minify: false,
  external: ['electron', 'electron-builder', '@morgana/cli', '@morgana/sdk'],
})
`,
  },
  {
    id: 'F10',
    path: 'packages/desktop-electron/vitest.config.mjs',
    why: 'Test runner config for the package.',
    note: '',
    content: `import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['src/**/*.test.ts'] },
})
`,
  },
  {
    id: 'F11',
    path: 'packages/desktop-electron/README.md',
    why: 'Repo convention: every package documents purpose + commands.',
    note: '',
    content: `# @morgana/desktop-electron

The desktop backend for Morgana. Boots a compiled project's \`dist/desktop/\`
inside Electron: the app window on the loopback host, \`ctx.desktop.os\`
capabilities, the local object runtime, declarative cron, and the installer
project (Windows nsis first).

\`\`\`
morgana desktop dev       # compile, boot the host, open the app window
morgana desktop package   # compile, scaffold + build the installer
\`\`\`

Package scripts: \`build\` (tsup), \`typecheck\` (\`tsc --noEmit\`), \`test\`
(vitest). Unit tests never import Electron — capability gating, the object
runtime and the pack scaffolder are pure modules with injected backends.

Launching the app needs the real Electron binary: allow its postinstall
once with \`pnpm approve-builds\` (or add it under \`allowBuilds\` in
pnpm-workspace.yaml). Build, typecheck and tests never need it.
`,
  },
  {
    id: 'F12',
    path: 'packages/desktop-electron/src/index.ts',
    why: 'run(): whenReady → backend-built ctx.desktop (os/app/objects) → dev() with it → schedule desktop cron only → window on the loopback host. Electron and the CLI host resolve dynamically from the installed package; nothing electron is imported statically, so tests and typecheck never need the binary.',
    note: '',
    content: `/**
 * Desktop backend entry — \`run()\` boots the app, \`pack()\` ships it.
 *
 * run() is five steps, in order: read dist/, build ctx.desktop, boot the
 * reference host with it, schedule the DESKTOP partition's cron, open the
 * window on the loopback host. Server-lane cron stays with the cloud — the
 * app fires its own lane only. Client pages are untouched: they keep calling
 * fetch('/api/actions/<name>/run') and the host answers on loopback.
 */

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import type { DesktopApi, DesktopAppInfo } from '@morgana/sdk'
import { buildOs } from './os'
import { electronBackend, type ElectronModule } from './electron-os'
import { createObjectsRuntime, type ObjectTypeDef } from './objects'

export { buildOs } from './os'
export type { OsBackend } from './os'
export { createObjectsRuntime } from './objects'
export type { ObjectTypeDef } from './objects'
export { pack, scaffold } from './pack'

export interface DesktopRunOptions {
  dir?: string
  port?: number
}

interface HostModule {
  dev: (opts: {
    dir?: string
    port?: number
    desktop?: unknown
  }) => Promise<{
    server: import('node:http').Server
    shutdown: () => void
    runAction: (name: string, params?: unknown) => Promise<unknown>
  }>
  CronScheduler: new (opts?: {
    runAction?: (name: string, params?: unknown) => Promise<unknown>
    persistFile?: string | null
  }) => {
    schedule(name: string, spec: { cron: string; run: string; params?: unknown; enabled?: boolean }): Promise<unknown>
    start(): void
    stop(): void
  }
}

function readJson(file: string, fallback: never): never
function readJson<T>(file: string, fallback: T): T
function readJson(file: string, fallback: unknown): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as unknown
  } catch {
    return fallback
  }
}

/** Resolve an installed package file to an importable URL — no static imports. */
function resolveInstalled(spec: string): string {
  const resolved = createRequire(path.join(process.cwd(), 'package.json')).resolve(spec)
  return pathToFileURL(resolved).href
}

export async function run({ dir = process.cwd(), port = 4317 }: DesktopRunOptions = {}): Promise<{
  window: { close: () => void }
  server: import('node:http').Server
  shutdown: () => void
}> {
  const projectDir = path.resolve(dir)
  const dist = path.join(projectDir, 'dist')
  const appFile = path.join(dist, 'desktop', 'app.json')
  if (!fs.existsSync(appFile)) {
    throw new Error(
      'dist/desktop/app.json not found — declare the desktop lane (a desktop action or config.desktop) and run \`morgana build\` first',
    )
  }
  const appJson = readJson<{ backend?: string; os?: string[]; apps?: Array<{ name: string; displayName?: string; bundleId: string; icon?: string }> }>(appFile, {})
  const manifest = readJson<{ entry?: string }>(path.join(dist, 'manifest.json'), {})
  const objectDefs = readJson<ObjectTypeDef[]>(path.join(dist, 'objects.json'), [])

  const host = (await import(resolveInstalled('@morgana/cli/host'))) as unknown as HostModule
  const electron = (await import(resolveInstalled('electron'))) as unknown as ElectronModule
  if (!electron.app?.whenReady || typeof electron.BrowserWindow !== 'function') {
    throw new Error(
      'Electron did not load a runnable app module — its postinstall binary is missing. ' +
      'Install it on demand with \`pnpm --filter @morgana/desktop-electron rebuild electron\`, then retry.',
    )
  }
  await electron.app.whenReady()

  const backend = electronBackend(electron)
  const os = buildOs({ declared: appJson.os ?? [], backend })
  const primary = appJson.apps?.[0]
  const app: DesktopAppInfo = {
    name: primary?.name ?? path.basename(projectDir),
    bundleId: primary?.bundleId ?? 'com.morgana.desktop',
    version: electron.app.getVersion(),
    userDataPath: electron.app.getPath('userData'),
    isPackaged: electron.app.isPackaged,
  }
  const objects = createObjectsRuntime({
    defs: objectDefs,
    file: path.join(electron.app.getPath('userData'), 'objects.json'),
    vars: readJson<Record<string, unknown>>(path.join(dist, 'manifest.json'), {}),
    desktop: { os, app },
  })
  const desktop: DesktopApi = { os, app, objects }

  const hostHandle = await host.dev({ dir: projectDir, port, desktop })
  const addr = hostHandle.server.address()
  const actualPort = typeof addr === 'object' && addr ? addr.port : port
  void manifest

  // Declarative schedules for desktop-lane actions only. Anything without a
  // cron expression (backend-event triggers) is skipped with a note: the app
  // has no store event bus in v1, and claiming otherwise would be a schedule
  // that never fires.
  const triggers = readJson<Array<{ name: string; run: string; cron?: string; enabled?: boolean }>>(
    path.join(dist, 'desktop', 'triggers.json'),
    [],
  )
  const scheduler = new host.CronScheduler({
    runAction: (name, params) => hostHandle.runAction(name, params),
    persistFile: path.join(electron.app.getPath('userData'), 'crons.json'),
  })
  for (const t of triggers) {
    if (!t.cron) {
      console.log('[morgana] skipping non-cron desktop trigger "' + t.name + '" — the app fires cron and http only')
      continue
    }
    await scheduler.schedule(t.name, { cron: t.cron, run: t.run, enabled: t.enabled })
  }
  scheduler.start()

  const win = new electron.BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: { contextIsolation: true },
  })
  await win.loadURL('http://127.0.0.1:' + actualPort + '/')

  const shutdown = (): void => {
    try {
      scheduler.stop()
    } catch {
      // Stopping a scheduler that never started is not a failure.
    }
    if (!win.isDestroyed()) win.close()
    hostHandle.shutdown()
  }
  electron.app.on('window-all-closed', () => shutdown())
  return { window: win, server: hostHandle.server, shutdown }
}
`,
  },
  {
    id: 'F13',
    path: 'packages/desktop-electron/src/os.ts',
    why: 'Capability gate for ctx.desktop.os. Declared groups pass through to the backend impl; undeclared groups throw a named error on access (lazy getters, so merely building the handle never throws); unknown group names fail the build of the handle itself. The backend is injected — tests use a fake, run() uses Electron.',
    note: '',
    content: `/**
 * ctx.desktop.os — the machine behind declared capability groups.
 *
 * The config declares which groups the app may use (desktop.os); this module
 * enforces it. Access is through lazy getters: building the handle never
 * throws, REACHING for an undeclared group throws a named error telling the
 * author exactly which config line to add. Unknown group names fail here, at
 * handle build time, because a typo in the config must not become a silent
 * missing capability at runtime.
 */

import type { DesktopOsGroup, DesktopOsHandle } from '@morgana/sdk'

/** What a backend provides per group, before capability gating. */
export interface OsBackend {
  platform: string
  arch: string
  dataDir: string
  fs: {
    readFile(p: string): Promise<string | Uint8Array | null>
    writeFile(p: string, data: string | Uint8Array): Promise<void>
    exists(p: string): Promise<boolean>
    list(dir?: string): Promise<string[]>
    remove(p: string): Promise<boolean>
  }
  clipboard: {
    read(): Promise<string>
    write(text: string): Promise<void>
  }
  notify: {
    show(title: string, body?: string): Promise<void>
  }
  shell: {
    openPath(p: string): Promise<string>
    openUrl(url: string): Promise<void>
  }
}

const KNOWN: DesktopOsGroup[] = ['fs', 'clipboard', 'notify', 'shell']

export function buildOs({ declared = [], backend }: { declared?: string[]; backend: OsBackend }): DesktopOsHandle {
  const unknown = (declared ?? []).filter((g) => !(KNOWN as string[]).includes(g))
  if (unknown.length) {
    throw new Error(
      'unknown desktop os group(s) ' +
        unknown.map((g) => JSON.stringify(g)).join(', ') +
        ' in morgana.config.ts (desktop.os) — known groups: ' +
        KNOWN.join(', '),
    )
  }
  const allowed = new Set((declared ?? []).filter((g): g is DesktopOsGroup => (KNOWN as string[]).includes(g)))
  const need = <G extends DesktopOsGroup>(group: G): OsBackend[G] => {
    if (!allowed.has(group)) {
      throw new Error(
        'desktop os group "' + group + '" is not declared in morgana.config.ts (desktop.os)' + ' — declare it to use ctx.desktop.os.' + group,
      )
    }
    const impl = backend[group]
    if (!impl) {
      throw new Error(
        'desktop backend implements no os group "' + group + '" — declared in desktop.os but nothing answers it',
      )
    }
    return impl
  }
  return {
    platform: backend.platform,
    arch: backend.arch,
    get fs() {
      const f = need('fs')
      return { ...f, dataDir: backend.dataDir }
    },
    get clipboard() {
      return need('clipboard')
    },
    get notify() {
      return need('notify')
    },
    get shell() {
      return need('shell')
    },
  }
}
`,
  },
  {
    id: 'F14',
    path: 'packages/desktop-electron/src/electron-os.ts',
    why: 'The real OsBackend, built from an injected Electron module (never imported statically — unit tests and typecheck must not need the binary). fs is rooted in <userData>/os with traversal refused; clipboard/notify/shell are thin Electron calls.',
    note: '',
    content: `/**
 * The Electron implementation of OsBackend.
 *
 * Takes the Electron module as a parameter rather than importing it: a static
 * import would make every unit test and every typecheck require the Electron
 * binary. run() resolves it dynamically and passes it in; tests pass a fake.
 */

import fs from 'node:fs'
import path from 'node:path'
import type { OsBackend } from './os'

/** Structural slice of Electron that this backend touches. */
export interface ElectronModule {
  app: {
    whenReady(): Promise<void>
    getPath(name: string): string
    getVersion(): string
    isPackaged: boolean
    on(event: string, cb: () => void): void
  }
  BrowserWindow: new (opts: unknown) => {
    loadURL(url: string): Promise<void>
    isDestroyed(): boolean
    close(): void
  }
  clipboard: {
    readText(): string
    writeText(text: string): void
  }
  shell: {
    openPath(p: string): Promise<string>
    openExternal(url: string): Promise<void>
  }
  Notification: new (opts: { title: string; body?: string }) => {
    show(): void
  }
}

/** Refuse traversal before anything touches the filesystem. */
function safeJoin(root: string, key: string): string {
  if (typeof key !== 'string' || key === '') throw new Error('a file path is required')
  const full = path.resolve(root, key)
  const base = path.resolve(root)
  if (full !== base && !full.startsWith(base + path.sep)) {
    throw new Error('file path "' + key + '" escapes the os files root')
  }
  return full
}

function listFiles(root: string, dir: string): string[] {
  const out: string[] = []
  const walk = (d: string, prefix: string): void => {
    let items: fs.Dirent[]
    try {
      items = fs.readdirSync(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const item of items) {
      const rel = prefix ? prefix + '/' + item.name : item.name
      if (item.isDirectory()) walk(path.join(d, item.name), rel)
      else if (item.isFile()) out.push(rel)
    }
  }
  walk(dir, '')
  void root
  return out.sort()
}

export function electronBackend(electron: ElectronModule): OsBackend {
  const dataDir = path.join(electron.app.getPath('userData'), 'os')
  fs.mkdirSync(dataDir, { recursive: true })
  return {
    platform: process.platform,
    arch: process.arch,
    dataDir,
    fs: {
      readFile: async (p) => {
        const full = safeJoin(dataDir, p)
        if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return null
        const buf = fs.readFileSync(full)
        try {
          return new TextDecoder('utf-8', { fatal: true }).decode(buf)
        } catch {
          return new Uint8Array(buf)
        }
      },
      writeFile: async (p, data) => {
        const full = safeJoin(dataDir, p)
        fs.mkdirSync(path.dirname(full), { recursive: true })
        fs.writeFileSync(full, typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data))
      },
      exists: async (p) => fs.existsSync(safeJoin(dataDir, p)),
      list: async (dir) => listFiles(dataDir, safeJoin(dataDir, dir ?? '.')),
      remove: async (p) => {
        const full = safeJoin(dataDir, p)
        if (!fs.existsSync(full)) return false
        fs.rmSync(full, { recursive: true, force: true })
        return true
      },
    },
    clipboard: {
      read: async () => electron.clipboard.readText(),
      write: async (text) => electron.clipboard.writeText(text),
    },
    notify: {
      show: async (title, body) => {
        new electron.Notification({ title, body }).show()
      },
    },
    shell: {
      openPath: (p) => electron.shell.openPath(p),
      openUrl: (url) => electron.shell.openExternal(url),
    },
  }
}
`,
  },
  {
    id: 'F15',
    path: 'packages/desktop-electron/src/objects.ts',
    why: 'Local object runtime for ctx.desktop.objects: JSON-file persistence (zero coupling to the host store), per-op compilation cached, shape-column defaults on create. run() returns the value and persists nothing — persistence is explicit via set(). Ops run WITHOUT the server spine (named throwing proxy, not undefined).',
    note: '',
    content: `/**
 * Local object runtime — \`ctx.desktop.objects\` on the desktop lane.
 *
 * Instances persist to a JSON file beside the app data (one file, keyed
 * \`type:id\`) — deliberately NOT the host's SQLite store. The host owns
 * collections; objects are a separate domain with free-form state, and
 * sharing the store would couple their schemas, migrations and locking for
 * no reason. A second file the app owns outright is simpler and survives the
 * host being swapped.
 *
 * Op semantics, stated once: \`run()\` returns the op's return value and
 * persists nothing by itself. State changes only through
 * \`ctx.object.set()\` inside the op or \`set()\` outside it. A computed
 * value nobody stores is just a value — silently writing it back would make
 * every read a write.
 *
 * Op ctx on v1 is args/params/object/desktop/log/vars. There is no
 * ctx.server behind it, so \`server\`/\`ai\`/\`actions\` are throwing proxies
 * with a named error rather than undefined — an op reaching for the cloud
 * spine learns which lane it belongs in instead of TypeErroring on void.
 */

import fs from 'node:fs'
import path from 'node:path'
import type {
  DesktopAppInfo,
  DesktopObjectInstance,
  DesktopObjectsHandle,
  DesktopObjectTypeDef,
  DesktopOsHandle,
} from '@morgana/sdk'

/** One entry of dist/objects.json as the desktop host reads it. */
export interface ObjectTypeDef {
  name: string
  shape?: unknown
  links?: unknown
  computed?: unknown
  ops: string[]
  opSrc: Record<string, string>
}

export interface ObjectsRuntimeDeps {
  defs?: ObjectTypeDef[]
  /** Instance persistence file, e.g. <userData>/objects.json. */
  file: string
  vars?: Record<string, unknown>
  desktop: { os: DesktopOsHandle; app: DesktopAppInfo }
}

type InstanceDb = Record<string, { id: string; type: string; state: Record<string, unknown> }>

function readDb(file: string): InstanceDb {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as InstanceDb
    return {}
  } catch {
    return {}
  }
}

function writeDb(file: string, db: InstanceDb): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(db, null, 2), 'utf8')
}

const uid = (type: string): string => type + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)

/** Column defaults so a created instance is complete before props land. */
function defaultsFor(shape: unknown): Record<string, unknown> {
  const columns = (shape as { columns?: Array<{ name: string; type: string }> } | undefined)?.columns
  if (!Array.isArray(columns)) return {}
  const out: Record<string, unknown> = {}
  for (const c of columns) {
    if (!c || typeof c.name !== 'string') continue
    out[c.name] = c.type === 'number' ? 0 : c.type === 'boolean' ? false : ''
  }
  return out
}

function throwingSpine(group: 'server' | 'ai' | 'actions'): unknown {
  return new Proxy(
    {},
    {
      get: (_t, key) => {
        throw new Error(
          'ctx.' + group + '.' + String(key) + ' is not available to object ops on desktop v1' + ' — this op needs the cloud lane, or the op must stay state-local',
        )
      },
    },
  )
}

export function createObjectsRuntime(deps: ObjectsRuntimeDeps): DesktopObjectsHandle {
  const { file, vars = {}, desktop } = deps
  const types = new Map((deps.defs ?? []).map((d) => [d.name, d]))
  const compiled = new Map<string, (ctx: unknown, params: unknown) => unknown>()

  const defOf = (type: string): ObjectTypeDef => {
    const def = types.get(type)
    if (!def) {
      throw new Error('unknown object type "' + type + '" — known types: ' + ([...types.keys()].join(', ') || '(none)'))
    }
    return def
  }

  const compileOp = (type: string, op: string): ((ctx: unknown, params: unknown) => unknown) => {
    const key = type + ' :: ' + op
    const hit = compiled.get(key)
    if (hit) return hit
    const def = defOf(type)
    const src = def.opSrc?.[op]
    if (typeof src !== 'string' || !src) {
      throw new Error(
        'object "' + type + '" has no runnable source for op "' + op + '"' + ' — the op is declared but its body did not ship (see the build warning)',
      )
    }
    let fn: unknown
    try {
      fn = new Function('return (' + src + ')')() as unknown
    } catch (err) {
      throw new Error('object "' + type + '" op "' + op + '" does not compile: ' + (err instanceof Error ? err.message : String(err)))
    }
    if (typeof fn !== 'function') {
      throw new Error('object "' + type + '" op "' + op + '" is not a function once compiled')
    }
    const typed = fn as (ctx: unknown, params: unknown) => unknown
    compiled.set(key, typed)
    return typed
  }

  const api: DesktopObjectsHandle = {
    types: async (): Promise<DesktopObjectTypeDef[]> =>
      [...types.values()].map((d) => ({ name: d.name, shape: d.shape, ops: d.ops })),

    type: async (name: string): Promise<DesktopObjectTypeDef | null> => {
      const d = types.get(name)
      return d ? { name: d.name, shape: d.shape, ops: d.ops } : null
    },

    create: async (type: string, props = {}): Promise<DesktopObjectInstance> => {
      const def = defOf(type)
      const db = readDb(file)
      const id = uid(type)
      const state = { ...defaultsFor(def.shape), ...(props ?? {}) }
      db[type + ':' + id] = { id, type, state }
      writeDb(file, db)
      return { id, type, state: { ...state } }
    },

    get: async (type: string, id: string): Promise<DesktopObjectInstance | null> => {
      defOf(type)
      const rec = readDb(file)[type + ':' + id]
      return rec ? { id: rec.id, type: rec.type, state: { ...rec.state } } : null
    },

    run: async (type: string, id: string, op: string, params = {}): Promise<unknown> => {
      defOf(type)
      const key = type + ':' + id
      const rec = readDb(file)[key]
      if (!rec) throw new Error('no "' + type + '" instance "' + id + '"')
      const fn = compileOp(type, op)
      const opCtx = {
        args: params,
        params,
        object: {
          type,
          name: type,
          instanceId: id,
          state: { ...rec.state },
          get: async (): Promise<Record<string, unknown>> => ({ ...(readDb(file)[key]?.state ?? {}) }),
          set: async (patch: Record<string, unknown>): Promise<Record<string, unknown>> => {
            const db = readDb(file)
            const cur = db[key]
            if (!cur) throw new Error('no "' + type + '" instance "' + id + '"')
            cur.state = { ...cur.state, ...(patch ?? {}) }
            writeDb(file, db)
            return { ...cur.state }
          },
        },
        desktop: { ...desktop, objects: api },
        log: (...parts: unknown[]): void => {
          console.log('[object ' + type + ':' + id + ']', ...parts)
        },
        vars: { ...vars },
        server: throwingSpine('server'),
        ai: throwingSpine('ai'),
        actions: throwingSpine('actions'),
      }
      return await fn(opCtx, params)
    },

    set: async (type: string, id: string, patch: Record<string, unknown>): Promise<DesktopObjectInstance> => {
      defOf(type)
      const key = type + ':' + id
      const db = readDb(file)
      const rec = db[key]
      if (!rec) throw new Error('no "' + type + '" instance "' + id + '"')
      rec.state = { ...rec.state, ...(patch ?? {}) }
      writeDb(file, db)
      return { id: rec.id, type: rec.type, state: { ...rec.state } }
    },

    remove: async (type: string, id: string): Promise<boolean> => {
      defOf(type)
      const key = type + ':' + id
      const db = readDb(file)
      if (!db[key]) return false
      delete db[key]
      writeDb(file, db)
      return true
    },
  }
  return api
}
`,
  },
  {
    id: 'F16',
    path: 'packages/desktop-electron/src/pack.ts',
    why: 'Installer project: scaffold writes the Electron project (package.json with builder config, main.mjs booting run(), dist/ copied in); pack() with mode package runs electron-builder on it. Windows nsis only for v1 (approved call #3). Dependency versions are read from the installed packages, never guessed.',
    note: '',
    content: `/**
 * Installer project — scaffold + package.
 *
 * scaffold() writes a standalone Electron project into outDir: a package.json
 * (app identity + electron-builder config), a main.mjs that boots run(), and
 * the compiled dist/ copied in. pack() with mode 'package' then runs
 * electron-builder on it. Modes are separate because scaffolding is instant
 * and reviewable while packaging downloads toolchains — conflating them would
 * make a dry look at the project cost a build.
 *
 * Windows (nsis) only for v1. A second target is one config line when the
 * second OS is tested, not before.
 */

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

export interface PackOptions {
  dir?: string
  outDir?: string
  mode?: 'scaffold' | 'package'
}

export interface PackResult {
  outDir: string
  bundleId: string
  name: string
  version: string
}

function readJson(file: string, fallback: never): never
function readJson<T>(file: string, fallback: T): T
function readJson(file: string, fallback: unknown): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as unknown
  } catch {
    return fallback
  }
}

/** This package's own version — works from src/ and from dist/. */
function ownVersion(): string {
  try {
    const pkgFile = new URL('../package.json', import.meta.url)
    return (JSON.parse(fs.readFileSync(pkgFile, 'utf8')) as { version?: string }).version ?? '0.1.0'
  } catch {
    return '0.1.0'
  }
}

/** An installed dependency's version, resolved from here (exports-map safe). */
function installedVersion(name: string, entry: string): string {
  try {
    const resolved = createRequire(import.meta.url).resolve(name + '/' + entry)
    const pkgFile = path.join(path.dirname(resolved), 'package.json')
    return (JSON.parse(fs.readFileSync(pkgFile, 'utf8')) as { version?: string }).version ?? '0.1.0'
  } catch {
    return '0.1.0'
  }
}

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true })
  for (const item of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, item.name)
    const to = path.join(dest, item.name)
    if (item.isDirectory()) copyDir(from, to)
    else if (item.isFile()) fs.copyFileSync(from, to)
  }
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'morgana-desktop'
}

export async function scaffold({ dir = process.cwd(), outDir }: PackOptions = {}): Promise<PackResult> {
  const projectDir = path.resolve(dir)
  const out = path.resolve(outDir ?? path.join(projectDir, 'desktop-out'))
  const dist = path.join(projectDir, 'dist')
  const appFile = path.join(dist, 'desktop', 'app.json')
  if (!fs.existsSync(appFile)) {
    throw new Error('dist/desktop/app.json not found — run \`morgana build\` on a project that declares the desktop lane first')
  }
  const appJson = readJson<{ backend?: string; apps?: Array<{ name: string; displayName?: string; bundleId: string; icon?: string }> }>(appFile, {})
  const projectPkg = readJson<{ name?: string; version?: string }>(path.join(projectDir, 'package.json'), {})
  const primary = appJson.apps?.[0]
  const name = slug(primary?.name ?? projectPkg.name ?? 'morgana-desktop')
  const version = projectPkg.version ?? '0.1.0'
  const bundleId = primary?.bundleId ?? 'com.morgana.desktop'
  const displayName = primary?.displayName ?? primary?.name ?? 'Morgana Desktop'

  const generated = {
    name,
    version,
    main: 'main.mjs',
    type: 'module',
    dependencies: {
      '@morgana/desktop-electron': '^' + ownVersion(),
      '@morgana/cli': '^' + installedVersion('@morgana/cli', 'host'),
      electron: '^33.0.0',
    },
    build: {
      appId: bundleId,
      productName: displayName,
      win: { target: ['nsis'] },
      files: ['main.mjs', 'package.json', 'dist/**/*'],
      directories: { output: 'release' },
    },
  }
  const main = [
    "import path from 'node:path'",
    "import { fileURLToPath } from 'node:url'",
    "import { run } from '@morgana/desktop-electron'",
    '',
    'const dir = path.dirname(fileURLToPath(import.meta.url))',
    '',
    '// Packaged app: an ephemeral loopback port — the window reads the real',
    '// one back from the booted host, so no port is ever reserved or clashed.',
    'await run({ dir, port: 0 })',
    '',
  ].join('\\n')

  fs.mkdirSync(out, { recursive: true })
  fs.writeFileSync(path.join(out, 'package.json'), JSON.stringify(generated, null, 2) + '\\n', 'utf8')
  fs.writeFileSync(path.join(out, 'main.mjs'), main, 'utf8')
  if (!fs.existsSync(dist)) throw new Error('dist/ not found in ' + projectDir + ' — run \`morgana build\` first')
  copyDir(dist, path.join(out, 'dist'))
  return { outDir: out, bundleId, name, version }
}

export async function pack({ dir = process.cwd(), outDir, mode = 'scaffold' }: PackOptions = {}): Promise<PackResult> {
  const info = await scaffold({ dir, outDir })
  if (mode === 'scaffold') return info
  // Required lazily and dynamically: electron-builder is a heavy toolchain
  // and scaffolding must never pay for it. createRequire (not import) because
  // the package ships no static types here by design.
  const req = createRequire(import.meta.url)
  let builder: { build: (opts: unknown) => Promise<unknown> }
  try {
    builder = req('electron-builder') as { build: (opts: unknown) => Promise<unknown> }
  } catch {
    throw new Error('electron-builder is not installed — pnpm add -D electron-builder in @morgana/desktop-electron to build installers')
  }
  await builder.build({ projectDir: info.outDir, win: ['nsis'] })
  return info
}
`,
  },
    {
    id: 'F17',
    path: 'packages/desktop-electron/src/__tests__/os.test.ts',
    why: 'Capability gate proof with a fake backend (no Electron): declared groups pass through, undeclared groups throw naming the config line, unknown group names fail at build.',
    note: '',
    content: `import { describe, expect, it } from 'vitest'
import { buildOs, type OsBackend } from '../os'

function backend(): OsBackend {
  return {
    platform: 'test-os',
    arch: 'test-arch',
    dataDir: '/tmp/morgana-os-test',
    fs: {
      readFile: async () => null,
      writeFile: async () => {},
      exists: async () => false,
      list: async () => [],
      remove: async () => false,
    },
    clipboard: {
      read: async () => 'clip',
      write: async () => {},
    },
    notify: {
      show: async () => {},
    },
    shell: {
      openPath: async () => '',
      openUrl: async () => {},
    },
    dialog: {
      openFiles: async () => null,
      saveFile: async () => null,
      message: async () => {},
    },
    window: {
      minimize: async () => {},
      maximize: async () => {},
      unmaximize: async () => {},
      isMaximized: async () => false,
      close: async () => {},
      hide: async () => {},
      show: async () => {},
      focus: async () => {},
      isVisible: async () => true,
      setTitle: async () => {},
      getBounds: async () => ({ x: 0, y: 0, width: 0, height: 0 }),
      setBounds: async () => {},
      center: async () => {},
      fullscreen: async () => {},
      isFullscreen: async () => false,
      setAlwaysOnTop: async () => {},
      drag: async () => {},
    },
  }
}

describe('buildOs', () => {
  it('passes declared groups through to the backend', async () => {
    const os = buildOs({ declared: ['fs', 'clipboard'], backend: backend() })
    expect(os.platform).toBe('test-os')
    expect(await os.clipboard.read()).toBe('clip')
    expect(await os.fs.exists('x')).toBe(false)
  })

  it('an undeclared group throws naming the config line', () => {
    const os = buildOs({ declared: ['fs'], backend: backend() })
    expect(() => os.notify).toThrow('desktop os group "notify" is not declared in morgana.config.ts (desktop.os)')
  })

  it('an unknown group name fails at build time', () => {
    expect(() => buildOs({ declared: ['teleport'], backend: backend() })).toThrow('unknown desktop os group(s) "teleport"')
  })

  it('building the handle never throws — only reaching does', () => {
    const os = buildOs({ declared: [], backend: backend() })
    expect(os.platform).toBe('test-os')
    expect(() => os.shell).toThrow('not declared')
  })
})
`,
  },
    {
    id: 'F18',
    path: 'packages/desktop-electron/src/__tests__/objects.test.ts',
    why: 'Local runtime proof: defaults + props on create, JSON persistence across instances, run() returns without persisting, set() persists, named errors for unknown type/op/missing instance and for the missing server spine.',
    note: '',
    content: `import { describe, expect, it, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createObjectsRuntime, type ObjectTypeDef } from '../objects'

const DEFS: ObjectTypeDef[] = [
  {
    name: 'counter',
    shape: { columns: [{ name: 'count', type: 'number' }, { name: 'label', type: 'string' }] },
    links: {},
    computed: {},
    ops: ['get', 'bump'],
    opSrc: {
      get: 'async (ctx) => ({ count: ctx.object.state.count ?? 0 })',
      bump: 'async (ctx, p) => ({ count: (ctx.object.state.count ?? 0) + Number(p.by ?? 1) })',
    },
  },
]

const DESKTOP = {
  os: { platform: 'test', arch: 'test' },
  app: { name: 't', bundleId: 'com.t', version: '0', userDataPath: '/tmp', isPackaged: false },
} as unknown as { os: never; app: never }

let file: string

beforeEach(() => {
  file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'morgana-obj-')), 'objects.json')
})

describe('local object runtime', () => {
  it('creates with column defaults under props, and persists to disk', async () => {
    const objects = createObjectsRuntime({ defs: DEFS, file, desktop: DESKTOP })
    const inst = await objects.create('counter', { label: 'c1' })
    expect(inst.state).toMatchObject({ count: 0, label: 'c1' })
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))['counter:' + inst.id].state.count).toBe(0)
    const again = createObjectsRuntime({ defs: DEFS, file, desktop: DESKTOP })
    expect(await again.get('counter', inst.id)).toMatchObject({ id: inst.id })
  })

  it('run() returns the value and persists nothing by itself', async () => {
    const objects = createObjectsRuntime({ defs: DEFS, file, desktop: DESKTOP })
    const inst = await objects.create('counter', {})
    const out = await objects.run('counter', inst.id, 'bump', { by: 3 })
    expect(out).toEqual({ count: 3 })
    expect((await objects.get('counter', inst.id))?.state.count).toBe(0)
    await objects.set('counter', inst.id, out as Record<string, unknown>)
    expect((await objects.get('counter', inst.id))?.state.count).toBe(3)
  })

  it('an op can persist through ctx.object.set', async () => {
    const withSetter: ObjectTypeDef[] = [
      { ...DEFS[0]!, ops: ['save'], opSrc: { save: 'async (ctx, p) => ctx.object.set(p)' } },
    ]
    const objects = createObjectsRuntime({ defs: withSetter, file, desktop: DESKTOP })
    const inst = await objects.create('counter', {})
    await objects.run('counter', inst.id, 'save', { count: 9 })
    expect((await objects.get('counter', inst.id))?.state.count).toBe(9)
  })

  it('unknown type, op and instance fail with names', async () => {
    const objects = createObjectsRuntime({ defs: DEFS, file, desktop: DESKTOP })
    await expect(objects.create('nope', {})).rejects.toThrow('unknown object type "nope"')
    const inst = await objects.create('counter', {})
    await expect(objects.run('counter', inst.id, 'nope', {})).rejects.toThrow('no runnable source for op "nope"')
    await expect(objects.run('counter', 'missing', 'get', {})).rejects.toThrow('no "counter" instance "missing"')
    expect(await objects.remove('counter', 'missing')).toBe(false)
  })

  it('the missing server spine is a named error, not undefined', async () => {
    const withSpine: ObjectTypeDef[] = [
      { ...DEFS[0]!, ops: ['reach'], opSrc: { reach: 'async (ctx) => ctx.server.collections' } },
    ]
    const objects = createObjectsRuntime({ defs: withSpine, file, desktop: DESKTOP })
    const inst = await objects.create('counter', {})
    await expect(objects.run('counter', inst.id, 'reach', {})).rejects.toThrow('not available to object ops on desktop v1')
  })
})
`,
  },
  {
    id: 'F19',
    path: 'packages/desktop-electron/src/__tests__/pack.test.ts',
    why: 'Scaffolder proof: writes package.json (appId, win nsis, deps), main.mjs booting run(), and copies dist/ in. mode package is not tested (needs the builder toolchain + network).',
    note: '',
    content: `import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { scaffold } from '../pack'

function project(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'morgana-pack-'))
  fs.mkdirSync(path.join(dir, 'dist', 'desktop'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'dist', 'desktop', 'app.json'),
    JSON.stringify({ backend: '@morgana/desktop-electron', os: [], apps: [{ name: 'shop', bundleId: 'com.morgana.shop' }] }),
    'utf8',
  )
  fs.writeFileSync(path.join(dir, 'dist', 'manifest.json'), JSON.stringify({ entry: 'home' }), 'utf8')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'demo-shop', version: '0.2.0' }), 'utf8')
  return dir
}

describe('scaffold', () => {
  it('writes the installer project with identity, builder config and dist', async () => {
    const dir = project()
    const out = path.join(dir, 'desktop-out')
    const info = await scaffold({ dir, outDir: out })
    expect(info.bundleId).toBe('com.morgana.shop')
    expect(info.version).toBe('0.2.0')
    const pkg = JSON.parse(fs.readFileSync(path.join(out, 'package.json'), 'utf8'))
    expect(pkg.build.appId).toBe('com.morgana.shop')
    expect(pkg.build.win.target).toEqual(['nsis'])
    expect(pkg.dependencies['@morgana/desktop-electron']).toMatch(/^\\^/)
    const main = fs.readFileSync(path.join(out, 'main.mjs'), 'utf8')
    expect(main).toContain("import { run } from '@morgana/desktop-electron'")
    expect(main).toContain('await run({ dir, port: 0 })')
    expect(fs.existsSync(path.join(out, 'dist', 'desktop', 'app.json'))).toBe(true)
  })

  it('refuses a project with no desktop lane', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'morgana-pack-no-'))
    await expect(scaffold({ dir, outDir: path.join(dir, 'out') })).rejects.toThrow('dist/desktop/app.json not found')
  })
})
`,
  },
  {
    id: 'F20',
    path: 'examples/sdk-compile-demo/src/actions/desktop/notes.ts',
    why: 'Demo proof the lane compiles in a real project: a desktop action behind a declared capability (clipboard), served on its own http route. `node examples/sdk-compile-demo/build.mjs` shows the new desktop row (E55).',
    note: '',
    content: `import { defineDesktopAction } from '@morgana/sdk'

/**
 * Desktop demo: reads the clipboard through the declared capability and
 * reports the app identity. Runs in the installed app, never in the cloud.
 */
export const notes = defineDesktopAction({
  config: { on: 'http.get /desktop-notes', auth: 'public' },
  handler: async (ctx) => {
    const clip = await ctx.desktop.os.clipboard.read()
    return {
      ok: true,
      platform: ctx.desktop.os.platform,
      app: ctx.desktop.app.name,
      clip: clip.slice(0, 80),
    }
  },
})
`,
  },
  {
    id: 'F21',
    path: 'packages/morgana-cli/src/commands/package.mjs',
    why: '`morgana package` — the building protocol. web = compile to dist/ (same path as `morgana build`); desktop = compile + backend pack (installer). Boots nothing, opens no window. Running is `morgana desktop` / `morgana dev`.',
    note: '',
    content: `/**
 * \`morgana package\` — the building protocol. Produces shippable artifacts,
 * boots nothing, opens no window.
 *
 *   package web      compile to dist/ (the same path \`morgana build\` takes)
 *   package desktop  compile, then scaffold and build the installer through
 *                    the configured backend's pack()
 *
 * Running is \`morgana desktop\` (the app) and \`morgana dev\` (web) — this
 * command never runs anything it built.
 */
import path from 'node:path'
import { scanProject } from '@morgana/sdk-compile'
import { build } from './build.mjs'
import { loadBackend, DEFAULT_BACKEND } from './desktop-backend.mjs'
import { say } from '../ui.mjs'

export async function packageTarget({ target = 'web', dir = process.cwd(), minify, outDir } = {}) {
  const projectDir = path.resolve(dir)
  if (target === 'web') {
    await build({ dir: projectDir, minify })
    say('web package: dist/')
    return
  }
  if (target === 'desktop') {
    await build({ dir: projectDir, minify })
    const scan = scanProject({ dir: projectDir })
    const backendName = scan.config.desktop?.backend ?? DEFAULT_BACKEND
    const backend = await loadBackend(projectDir, backendName)
    if (typeof backend.pack !== 'function') {
      throw new Error('desktop backend "' + backendName + '" exports no pack() — it cannot build an installer')
    }
    const out = await backend.pack({ dir: projectDir, outDir, mode: 'package' })
    say('desktop package: ' + (out?.outDir ?? outDir ?? '(unknown)'))
    return out
  }
  throw new Error('unknown package target "' + target + '" — want "web" or "desktop"')
}
`,
  },
  {
    id: 'F22',
    path: 'packages/morgana-cli/src/commands/desktop-backend.mjs',
    why: 'Shared backend loader for `morgana desktop` and `morgana package`. One resolve-from-project path, not two copies that can drift — the CLI never imports a backend statically, so swapping backends stays one config line.',
    note: '',
    content: `/**
 * Desktop backend loader — shared by \`morgana desktop\` and
 * \`morgana package\`.
 *
 * Resolved from the PROJECT, never from the CLI's own dependencies: the
 * backend is the project's dependency, so a project can pin, fork or replace
 * it and both commands keep working without knowing any backend by name.
 * One copy, here — two copies would mean every backend-resolution fix has to
 * be remembered twice.
 */
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

export const DEFAULT_BACKEND = '@morgana/desktop-electron'

export async function loadBackend(dir, name) {
  let resolved
  try {
    resolved = createRequire(path.join(dir, 'package.json')).resolve(name)
  } catch {
    throw new Error(
      'desktop backend "' + name + '" is not installed in ' + dir +
      ' — install it first (e.g. \`pnpm add -D \` + name + \`)\`',
    )
  }
  return import(pathToFileURL(resolved).href)
}
`,
  },
  {
    id: 'F23',
    path: 'packages/desktop-electron/src/__tests__/window.test.ts',
    why: 'Dialog + window proof with fakes (no Electron): cancel→null, confirm→path, calls delegate to the window, drag clamps to the work area, non-numeric drag throws named, undeclared group throws.',
    note: '',
    content: `import { describe, expect, it } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { buildOs } from '../os'
import { electronBackend, type ElectronModule, type ElectronWindow } from '../electron-os'

function fakeWin(bounds = { x: 1900, y: 100, width: 800, height: 600 }): ElectronWindow & {
  calls: string[]
  pos: Array<[number, number]>
} {
  const calls: string[] = []
  const pos: Array<[number, number]> = []
  return {
    calls,
    pos,
    minimize: () => { calls.push('minimize') },
    maximize: () => { calls.push('maximize') },
    unmaximize: () => { calls.push('unmaximize') },
    isMaximized: () => false,
    close: () => { calls.push('close') },
    hide: () => { calls.push('hide') },
    show: () => { calls.push('show') },
    focus: () => { calls.push('focus') },
    isVisible: () => true,
    setTitle: () => { calls.push('title') },
    getBounds: () => ({ ...bounds }),
    setBounds: () => { calls.push('bounds') },
    center: () => { calls.push('center') },
    setFullScreen: () => { calls.push('fullscreen') },
    isFullScreen: () => false,
    setAlwaysOnTop: () => { calls.push('ontop') },
    setPosition: (x: number, y: number) => { pos.push([x, y]) },
  }
}

function fakeElectron(pick: string[] | null = null): ElectronModule {
  const noWin = (() => { throw new Error('no real windows in tests') }) as unknown as ElectronModule['BrowserWindow']
  const noNotify = (() => { throw new Error('no notifications in tests') }) as unknown as ElectronModule['Notification']
  return {
    app: {
      whenReady: async () => {},
      getPath: () => path.join(os.tmpdir(), 'morgana-win-test'),
      getVersion: () => '0.0.0',
      isPackaged: false,
      on: () => {},
    },
    BrowserWindow: noWin,
    clipboard: { readText: () => '', writeText: () => {} },
    shell: { openPath: async () => '', openExternal: async () => {} },
    Notification: noNotify,
    dialog: {
      showOpenDialog: async () => (pick === null ? { canceled: true, filePaths: [] } : { canceled: false, filePaths: pick }),
      showSaveDialog: async () => ({ canceled: false, filePath: '/tmp/out.txt' }),
      showMessageBox: async () => ({ response: 0 }),
      showErrorBox: () => {},
    },
    screen: {
      getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1040 } }),
    },
  }
}

function gated(pick: string[] | null = null, declared: string[] = ['dialog', 'window']) {
  const win = fakeWin()
  const backend = electronBackend(fakeElectron(pick), win)
  return { win, os: buildOs({ declared, backend }) }
}

describe('dialog group', () => {
  it('cancel resolves null, confirm resolves the paths', async () => {
    expect(await gated(null).os.dialog.openFiles()).toBe(null)
    expect(await gated(['/a/b.txt']).os.dialog.openFiles()).toEqual(['/a/b.txt'])
    expect(await gated(null).os.dialog.saveFile()).toBe('/tmp/out.txt')
  })
})

describe('window group', () => {
  it('delegates calls to the bound window', async () => {
    const { win, os } = gated()
    await os.window.minimize()
    await os.window.close()
    await os.window.setTitle('Station')
    expect(win.calls).toEqual(['minimize', 'close', 'title'])
    expect(await os.window.isMaximized()).toBe(false)
  })

  it('clamps drag steps to the work area', async () => {
    const { win, os } = gated()
    await os.window.drag(500, 0)
    expect(win.pos).toEqual([[1840, 100]])
    await os.window.drag(-3000, -500)
    expect(win.pos[1]).toEqual([-720, 0])
  })

  it('rejects non-numeric drag with a named error', async () => {
    const { os } = gated()
    await expect(os.window.drag('x' as unknown as number, 0)).rejects.toThrow('numeric dx/dy')
  })

  it('an undeclared group throws naming the config line', () => {
    const { os } = gated(null, ['dialog'])
    expect(() => os.window).toThrow('desktop os group "window" is not declared in morgana.config.ts (desktop.os)')
  })
})
`,
  },
]

const EDITS = [
  {
    id: 'E01',
    file: 'packages/sdk/src/actions.ts',
    at: 'lines 29-31',
    why: 'Import the DesktopContext type for the new factory.',
    note: '',
    mode: 'replace',
    anchor: `import type { ServerContext } from './contexts/server'
import type { ClientContext } from './contexts/client'`,
    code: `import type { ServerContext } from './contexts/server'
import type { ClientContext } from './contexts/client'
import type { DesktopContext } from './contexts/desktop'`,
  },
  {
    id: 'E02',
    file: 'packages/sdk/src/actions.ts',
    at: 'line 15',
    why: 'Document the third factory in the file doc so authors meet it where the other two are described.',
    note: '',
    mode: 'replace',
    anchor: ` *      defineClientAction  — ClientContext (ui objects/state/theme, …)`,
    code: ` *      defineClientAction  — ClientContext (ui objects/state/theme, …)
 *      defineDesktopAction — DesktopContext (the server spine plus
 *                             ctx.desktop: os, app, objects — the installed
 *                             app as a host)`,
  },
  {
    id: 'E03',
    file: 'packages/sdk/src/actions.ts',
    at: 'lines 65-67',
    why: 'The factory itself — an identity helper like the other two, so discovery reads it statically and the handler keeps full DesktopContext typing.',
    note: '',
    mode: 'after',
    anchor: `export function defineClientAction<Ctx extends ClientContext = ClientContext>(def: ActionDef<Ctx>): ActionDef<Ctx> {
  return def
}`,
    code: `
export function defineDesktopAction<Ctx extends DesktopContext = DesktopContext>(def: ActionDef<Ctx>): ActionDef<Ctx> {
  return def
}`,
  },
  {
    id: 'E04',
    file: 'packages/sdk/src/config.ts',
    at: 'line 187',
    why: 'Project-level desktop declaration: backend package + OS capability list. Kept on MorganaConfig (E05) so parseProjectConfig reads it with the same static-literal path as everything else.',
    note: '',
    mode: 'before',
    anchor: `export interface MorganaConfig {`,
    code: `/**
 * The desktop lane's project-level declaration.
 *
 * \`os\` is the capability list the app may use. A desktop action reaching for
 * a group outside this list gets a named error, not undefined — the same rule
 * the OS-permission model will enforce at pack time. \`backend\` names the
 * package that implements dist/desktop/ (default
 * @morgana/desktop-electron); \`morgana desktop\` resolves it from the
 * project, never from the CLI's own dependencies, so a future backend swaps
 * in with one config line.
 */
export interface DesktopConfig {
  /** Backend package implementing the desktop contract. */
  backend?: string
  /** OS capability groups the app may use: 'fs' | 'clipboard' | 'notify' | 'shell'. */
  os?: string[]
}

`,
  },
  {
    id: 'E05',
    file: 'packages/sdk/src/config.ts',
    at: 'lines 208-209',
    why: 'Expose desktop?: DesktopConfig on the single framework config.',
    note: '',
    mode: 'after',
    anchor: `  /** Apps to deploy — keyed by app name. Pages are added to the app by name. */
  apps?: Record<string, AppDefinition>`,
    code: `
  /**
   * The desktop lane's project-level declaration — backend package plus the
   * OS capability list the app may use. Absent means no desktop lane.
   */
  desktop?: DesktopConfig`,
  },
  {
    id: 'E06',
    file: 'packages/sdk/src/index.ts',
    at: 'lines 236-241',
    why: 'Export the desktop lane types from the barrel so the sdk-module-map rewriter in bundle.ts can resolve them per-module.',
    note: '',
    mode: 'after',
    anchor: `  EmitHandle,
  LogHandle,
} from './contexts/server'`,
    code: `
// Desktop lane — the installed app as a host (\`ctx.desktop\`)
export type {
  DesktopOsGroup,
  DesktopOsFs,
  DesktopOsClipboard,
  DesktopOsNotify,
  DesktopOsShell,
  DesktopOsDialog,
  DesktopOsWindow,
  DesktopOsHandle,
  DesktopAppInfo,
  DesktopObjectTypeDef,
  DesktopObjectInstance,
  DesktopObjectsHandle,
  DesktopApi,
  DesktopContext,
  DesktopObjectOpContext,
} from './contexts/desktop'`,
  },
  {
    id: 'E08',
    file: 'packages/sdk/src/index.ts',
    at: 'lines 344-345',
    why: 'Export defineDesktopAction beside the other two factories. Single-line value export keeps the compiler module-map regex matching.',
    note: '',
    mode: 'replace',
    anchor: `export type { ActionConfig, ActionDef } from './actions'
export { defineServerAction, defineClientAction } from './actions'`,
    code: `export type { ActionConfig, ActionDef } from './actions'
export { defineServerAction, defineClientAction, defineDesktopAction } from './actions'`,
  },
  {
    id: 'E09',
    file: 'packages/sdk-compile/src/extract.ts',
    at: 'line 15',
    why: 'Fourth lane. Everything downstream (split, bundle profile, emit partition) keys off this union.',
    note: '',
    mode: 'replace',
    anchor: `export type ActionLane = 'server' | 'client' | 'compile'`,
    code: `export type ActionLane = 'server' | 'client' | 'compile' | 'desktop'`,
  },
  {
    id: 'E10',
    file: 'packages/sdk-compile/src/extract.ts',
    at: 'line 16',
    why: 'FactoryKind mirrors the lane so bundle entry-picking keeps working.',
    note: '',
    mode: 'replace',
    anchor: `export type FactoryKind = 'server' | 'client' | 'plain-handle' | 'plain-run'`,
    code: `export type FactoryKind = 'server' | 'client' | 'desktop' | 'plain-handle' | 'plain-run'`,
  },
  {
    id: 'E11',
    file: 'packages/sdk-compile/src/extract.ts',
    at: 'line 129',
    why: 'FactoryFound.kind must admit desktop for the three-way callee below.',
    note: '',
    mode: 'replace',
    anchor: `  kind: 'server' | 'client'`,
    code: `  kind: 'server' | 'client' | 'desktop'`,
  },
  {
    id: 'E12',
    file: 'packages/sdk-compile/src/extract.ts',
    at: 'line 195',
    why: 'Recognize defineDesktopAction calls beside the other two factories.',
    note: '',
    mode: 'replace',
    anchor: `      if (callee !== 'defineServerAction' && callee !== 'defineClientAction') continue`,
    code: `      if (callee !== 'defineServerAction' && callee !== 'defineClientAction' && callee !== 'defineDesktopAction') continue`,
  },
  {
    id: 'E13',
    file: 'packages/sdk-compile/src/extract.ts',
    at: 'line 198',
    why: 'Three-way factory kind from the callee name.',
    note: '',
    mode: 'replace',
    anchor: `      const kind = callee === 'defineServerAction' ? 'server' : 'client'`,
    code: `      const kind = callee === 'defineServerAction' ? 'server' : callee === 'defineDesktopAction' ? 'desktop' : 'client'`,
  },
  {
    id: 'E14',
    file: 'packages/sdk-compile/src/extract.ts',
    at: 'lines 260-271',
    why: 'Lane of file: factory desktop wins, and a plain handler under a desktop/ folder lands in the desktop lane (same directory rule as client/server).',
    note: '',
    mode: 'replace',
    anchor: `function laneOfFile(file: string, factoryKind: 'server' | 'client' | null): ActionLane {
  const parts = file.split(/[\\\\/]/)
  if (parts.includes('compile')) return 'compile'
  if (factoryKind === 'client') return 'client'
  if (factoryKind === 'server') return 'server'
  // A plain handler has no factory to say which lane it is, so the directory
  // decides. \`browser\` is still read so an existing project's folder keeps
  // working after the rename to \`client\`.
  if (parts.includes('client') || parts.includes('browser')) return 'client'
  if (parts.includes('server')) return 'server'
  return 'server'
}`,
    code: `function laneOfFile(file: string, factoryKind: 'server' | 'client' | 'desktop' | null): ActionLane {
  const parts = file.split(/[\\\\/]/)
  if (parts.includes('compile')) return 'compile'
  if (factoryKind === 'client') return 'client'
  if (factoryKind === 'server') return 'server'
  if (factoryKind === 'desktop') return 'desktop'
  // A plain handler has no factory to say which lane it is, so the directory
  // decides. \`browser\` is still read so an existing project's folder keeps
  // working after the rename to \`client\`.
  if (parts.includes('client') || parts.includes('browser')) return 'client'
  if (parts.includes('server')) return 'server'
  if (parts.includes('desktop')) return 'desktop'
  return 'server'
}`,
  },
  {
    id: 'E15',
    file: 'packages/sdk-compile/src/extract.ts',
    at: 'line 453',
    why: 'Plain handlers keep the three-way lane instead of collapsing desktop into server.',
    note: '',
    mode: 'replace',
    anchor: `        lane: laneOfFile(file, null) === 'client' ? 'client' : 'server',`,
    code: `        lane: laneOfFile(file, null) === 'client' ? 'client' : laneOfFile(file, null) === 'desktop' ? 'desktop' : 'server',`,
  },
  {
    id: 'E16',
    file: 'packages/sdk-compile/src/bundle.ts',
    at: 'line 9',
    why: 'Document the fourth profile in the lane table.',
    note: '',
    mode: 'after',
    anchor: ` *   server   platform:node  format:esm   one self-contained file per action`,
    code: `
 *   desktop  platform:node  format:esm   one self-contained file per action
 *                                        (runs in Node — no builtin warning)`,
  },
  {
    id: 'E17',
    file: 'packages/sdk-compile/src/bundle.ts',
    at: 'lines 470-471',
    why: 'bundleDesktopAction: same Node/ESM profile and generated entry as the server lane, but WITHOUT the node-builtins warning — the app IS Node, so node:fs is the runtime rather than a deploy hazard. Warning here would teach authors to avoid the exact APIs the lane exists for.',
    note: '',
    mode: 'after',
    anchor: '  return `${COMPILED_MARKER}\\n${code}`' + '\n}',
    code: `
// ── desktop lane ──────────────────────────────────────────────────────────

/**
 * Bundle a desktop action into one self-contained ESM module exporting the
 * conventional \`handle(ctx)\` / \`run(input)\` the host dispatches on.
 *
 * Same profile as the server lane (platform node, format esm) and the same
 * SDK plugin — but deliberately no node-builtins warning. A desktop action
 * runs in the installed app's Node main process, so a builtin import is the
 * runtime, not a deploy hazard.
 */
export async function bundleDesktopAction(opts: BundleOptions): Promise<string> {
  const picked = pickHandlerExpr('__m', opts.name, opts.factory)
  const isPlainRun = opts.factory === 'plain-run'
  const param = isPlainRun ? 'input' : 'ctx'
  const fname = isPlainRun ? 'run' : 'handle'
  const body = isPlainRun ? 'return __fn(input);' : 'return __fn(ctx);'

  const code = await run(opts, {
    stdin: {
      contents: [
        'import * as __m from ' + JSON.stringify(opts.file) + ';',
        'var __fn = ' + picked + ';',
        'if (typeof __fn !== "function") throw new Error(' + JSON.stringify(
          'action "' + opts.name + '" exports no handler — use defineDesktopAction, or export function handle(ctx)',
        ) + ');',
        'export ' + (opts.async ? 'async ' : '') + 'function ' + fname + '(' + param + ') {',
        '  ' + body,
        '}',
      ].join('\\n'),
      resolveDir: path.dirname(opts.file),
      sourcefile: opts.name + '.morgana-entry.ts',
      loader: 'ts',
    },
    platform: 'node',
    format: 'esm',
  })
  return COMPILED_MARKER + '\\n' + code
}`,
  },
  {
    id: 'E18',
    file: 'packages/sdk-compile/src/index.ts',
    at: 'line 26',
    why: 'Import the desktop bundler beside the other lane bundlers.',
    note: '',
    mode: 'replace',
    anchor: `import { bundleBrowserActions, bundleCompileAction, bundleServerAction } from './bundle'`,
    code: `import { bundleBrowserActions, bundleCompileAction, bundleServerAction, bundleDesktopAction } from './bundle'`,
  },
  {
    id: 'E19',
    file: 'packages/sdk-compile/src/index.ts',
    at: 'lines 14-18',
    why: 'Import server-object discovery — the object catalog emits to dist/objects.json for both lanes.',
    note: '',
    mode: 'after',
    anchor: `import {
  discoverCustomObjects,
  loadCustomObjectDefinitions,
  bundleCustomObjects,
} from './custom-objects'`,
    code: `
import { discoverServerObjects } from './server-objects'`,
  },
  {
    id: 'E20',
    file: 'packages/sdk-compile/src/index.ts',
    at: 'line 51',
    why: 'CompileResult names the desktop actions so the CLI build row and tests can report them.',
    note: '',
    mode: 'after',
    anchor: `  compileActions: string[]`,
    code: `
  /** Desktop-lane action names — bundled to dist/desktop/, never deployed to the cloud. */
  desktopActions: string[]`,
  },
  {
    id: 'E21',
    file: 'packages/sdk-compile/src/index.ts',
    at: 'line 216',
    why: 'Split the desktop lane out of runtime actions so it never leaks into the server/client bundles.',
    note: '',
    mode: 'after',
    anchor: `  const clientActions = runtimeActions.filter((a) => a.lane === 'client')`,
    code: `
  const desktopActions = runtimeActions.filter((a) => a.lane === 'desktop')`,
  },
  {
    id: 'E22',
    file: 'packages/sdk-compile/src/index.ts',
    at: 'line 231',
    why: 'Partition derived routes/triggers by the lane of the action each entry runs. Derived once against the full graph (frontend bindings still resolve), then split — a desktop http route or cron belongs to dist/desktop/, never dist/server/.',
    note: '',
    mode: 'after',
    anchor: `  warnings.push(...bindingErrors)`,
    code: `
  // The desktop lane ships its own partition: a desktop action's http routes
  // and triggers belong to dist/desktop/, not dist/server/. Partitioned here
  // — after derivation, so frontend bindings still resolve against the full
  // graph — by the lane of the action each entry runs.
  const laneOfAction = new Map(runtimeActions.map((a) => [a.name, a.lane]))
  const isDesktopRun = (name: string): boolean => laneOfAction.get(name) === 'desktop'
  const serverApis = apis.filter((r) => !isDesktopRun(r.action))
  const desktopApis = apis.filter((r) => isDesktopRun(r.action))
  const serverTriggers = triggers.filter((t) => !isDesktopRun(t.run))
  const desktopTriggers = triggers.filter((t) => isDesktopRun(t.run))`,
  },
  {
    id: 'E23',
    file: 'packages/sdk-compile/src/index.ts',
    at: 'lines 279-280',
    why: 'Bundle desktop actions with the Node profile and no builtin warning (the app IS Node). After the server modules so ordering stays stable.',
    note: '',
    mode: 'after',
    anchor: `  // After the real ones, so a generated action can never shadow a user's.
  if (accessModule) serverModules.push(accessModule);`,
    code: `

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
  )`,
  },
  {
    id: 'E24',
    file: 'packages/sdk-compile/src/index.ts',
    at: 'line 134',
    why: 'buildDesktopDecl: backend package + os list + desktop app identities for dist/desktop/app.json. Returns undefined when the lane is absent so emit skips dist/desktop/ entirely.',
    note: '',
    mode: 'before',
    anchor: `export async function compileProject(opts: CompileOptions): Promise<CompileResult> {`,
    code: `/**
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
    backend: config.desktop?.backend ?? '@morgana/desktop-electron',
    os: [...(config.desktop?.os ?? [])],
    apps,
  }
}

`,
  },
  {
    id: 'E25',
    file: 'packages/sdk-compile/src/index.ts',
    at: 'line 292',
    why: 'Discover server objects for dist/objects.json (both lanes read it; only the desktop host runs the local runtime in v1). Runs only to feed emit — no bundling here, per the no-bundler rule.',
    note: '',
    mode: 'before',
    anchor: `  const emitted = emitDist(outDir, {`,
    code: `  // Server objects are discovered for the object pipeline — cloud and
  // desktop both read dist/objects.json, and only the desktop host runs the
  // local object runtime in v1. Emitted only when the project declares
  // objects, so a project with none builds byte-identically to before.
  const objectWarnings: string[] = []
  const discoveredObjects = discoverServerObjects(dir, objectWarnings)
  warnings.push(...objectWarnings)
  const desktopDecl = buildDesktopDecl(scan.config, desktopActions, warnings)

`,
  },
  {
    id: 'E26',
    file: 'packages/sdk-compile/src/index.ts',
    at: 'lines 307-308',
    why: 'Emit the server partition under its own name now that the desktop partition exists.',
    note: '',
    mode: 'replace',
    anchor: `    serverActions: serverModules,
    apis,
    triggers,`,
    code: `    serverActions: serverModules,
    apis: serverApis,
    triggers: serverTriggers,`,
  },
  {
    id: 'E27',
    file: 'packages/sdk-compile/src/index.ts',
    at: 'line 316',
    why: 'Feed the desktop partition, declaration and object catalog into emit.',
    note: '',
    mode: 'after',
    anchor: `    channels: Object.fromEntries(ir.channels),`,
    code: `
    desktopActions: desktopModules,
    desktopApis,
    desktopTriggers,
    desktop: desktopDecl,
    serverObjects: discoveredObjects,`,
  },
  {
    id: 'E28',
    file: 'packages/sdk-compile/src/index.ts',
    at: 'line 324',
    why: 'Return desktop action names for the CLI build row and tests.',
    note: '',
    mode: 'replace',
    anchor: `    serverActions: serverModules.map((m) => m.name),`,
    code: `    serverActions: serverModules.map((m) => m.name),
    desktopActions: desktopModules.map((m) => m.name),`,
  },
  {
    id: 'E29',
    file: 'packages/sdk-compile/src/emit.ts',
    at: 'line 10',
    why: 'Document the new dist layout in the file doc.',
    note: '',
    mode: 'after',
    anchor: ` *   server/triggers.json   (every other trigger: cron + backend events)`,
    code: `
 *   desktop/actions/<name>.js   (desktop-lane actions, Node ESM)
 *   desktop/apis.json            (http routes of desktop actions)
 *   desktop/triggers.json        (cron + backend-event triggers of desktop actions)
 *   desktop/app.json             (backend package, os capabilities, app identity)
 *   objects.json                 (server-object catalog with standalone op source)`,
  },
  {
    id: 'E30',
    file: 'packages/sdk-compile/src/emit.ts',
    at: 'line 19',
    why: 'Type the object catalog input from the discovery module.',
    note: '',
    mode: 'after',
    anchor: `import type { HttpRoute, Trigger } from './routes'`,
    code: `
import type { DiscoveredServerObject } from './server-objects'`,
  },
  {
    id: 'E31',
    file: 'packages/sdk-compile/src/emit.ts',
    at: 'line 29',
    why: 'EmitInputs carries the desktop partition, declaration and object catalog — all optional, all skipped when absent.',
    note: '',
    mode: 'after',
    anchor: `  serverActions: Array<{ name: string; code: string }>`,
    code: `
  /**
   * Desktop action modules, bundled for Node. Written to
   * desktop/actions/ only when non-empty (or desktop is set) — see below.
   */
  desktopActions?: Array<{ name: string; code: string }>
  /** Http routes whose action is desktop-lane — served by the app host, never deployed. */
  desktopApis?: HttpRoute[]
  /** Cron/backend-event triggers whose action is desktop-lane. */
  desktopTriggers?: Trigger[]
  /**
   * The desktop declaration for desktop/app.json. Undefined means the
   * project does not declare the lane and dist/desktop/ is skipped entirely.
   */
  desktop?: { backend: string; os: string[]; apps: Array<{ name: string; displayName?: string; bundleId: string; icon?: string; window?: { width?: number; height?: number; frameless?: boolean; transparent?: boolean; resizable?: boolean; title?: string } }> }
  /** Server-object catalog for objects.json — written only when non-empty. */
  serverObjects?: DiscoveredServerObject[]`,
  },
  {
    id: 'E32',
    file: 'packages/sdk-compile/src/emit.ts',
    at: 'lines 104-107',
    why: 'Write the desktop partition and the object catalog. Both conditional — absent lane means zero new files.',
    note: '',
    mode: 'after',
    anchor: `  write(
    'server/stores.json',
    \`$\{JSON.stringify([...inputs.ir.stores.values()], null, 2)}\\n\`,
  )`,
    code: `
  // The desktop partition — backend-agnostic by design: any backend package
  // (Electron now, a Rust shell later) boots from these files. Written only
  // when the project declares the lane, so every other project builds
  // byte-identically to before it existed.
  const desktopActions = inputs.desktopActions ?? []
  const hasDesktop = desktopActions.length > 0 || inputs.desktop !== undefined
  if (hasDesktop) {
    for (const a of desktopActions) {
      write(\`desktop/actions/$\{a.name}.js\`, a.code)
    }
    write('desktop/apis.json', \`$\{JSON.stringify(inputs.desktopApis ?? [], null, 2)}\\n\`)
    write('desktop/triggers.json', \`$\{JSON.stringify(inputs.desktopTriggers ?? [], null, 2)}\\n\`)
    const decl = inputs.desktop ?? { backend: '@morgana/desktop-electron', os: [], apps: [] }
    write('desktop/app.json', \`$\{JSON.stringify(decl, null, 2)}\\n\`)
  }
  // The object catalog both lanes read. The desktop host boots its local
  // object runtime from it; the cloud object pipeline reads the same file.
  if (inputs.serverObjects?.length) {
    write('objects.json', \`$\{JSON.stringify(inputs.serverObjects, null, 2)}\\n\`)
  }`,
  },
  {
    id: 'E33',
    file: 'packages/sdk-compile/src/emit.ts',
    at: 'lines 122-126',
    why: 'Hash the new artefacts only when present — always-present keys would change every existing project hash for no reason.',
    note: '',
    mode: 'replace',
    anchor: `        stores: [...inputs.ir.stores.values()],
        minify: inputs.minify ?? false,
      }),`,
    code: `        stores: [...inputs.ir.stores.values()],
        minify: inputs.minify ?? false,
        // In the hash only when present: adding always-present keys would
        // change every existing project's hash for no reason.
        ...(hasDesktop || (inputs.serverObjects?.length ?? 0) > 0
          ? {
              desktop: {
                actions: inputs.desktopActions ?? [],
                apis: inputs.desktopApis ?? [],
                triggers: inputs.desktopTriggers ?? [],
                app: inputs.desktop ?? null,
                objects: inputs.serverObjects ?? [],
              },
            }
          : {}),
      }),`,
  },
  {
    id: 'E34',
    file: 'packages/sdk-compile/src/emit.ts',
    at: 'line 144',
    why: 'Manifest names desktop actions separately and NEVER in `actions` — the cloud deploys that list, and a Node action deployed to the sandbox would fail there. Omitted when the lane is absent so existing manifests keep their shape exactly.',
    note: '',
    mode: 'replace',
    anchor: `        actions: inputs.serverActions.map((a) => a.name),`,
    code: `        actions: inputs.serverActions.map((a) => a.name),
        // Desktop actions are NEVER in actions: the cloud deploys that list.
        // The desktop host reads this list instead. Omitted when the lane is
        // absent, so existing manifests keep their shape exactly.
        ...(hasDesktop
          ? { desktopActions: (inputs.desktopActions ?? []).map((a) => a.name) }
          : {}),`,
  },
  {
    id: 'E35',
    file: 'packages/sdk-compile/src/server-objects.ts',
    at: 'line 20',
    why: 'esbuild strips TypeScript from extracted op source — the host compiles plain JS, and a type annotation there would be a SyntaxError naming nobody.',
    note: '',
    mode: 'after',
    anchor: `import ts from 'typescript'`,
    code: `
import esbuild from 'esbuild'`,
  },
  {
    id: 'E36',
    file: 'packages/sdk-compile/src/server-objects.ts',
    at: 'lines 32-33',
    why: 'opSrc: standalone runnable source per op. An op with no entry keeps its name (the cloud pipeline still sees it) but has nothing runnable — the build says why.',
    note: '',
    mode: 'after',
    anchor: `  /** Op names — the keys of the \`ops\` object literal. */
  ops: string[]`,
    code: `

  /**
   * Standalone op source by op name — TypeScript stripped, module imports
   * unusable. The desktop host compiles each entry with new Function and
   * calls it with the op ctx, so a body may only reference its own params,
   * its ctx, and globals.
   */
  opSrc: Record<string, string>`,
  },
  {
    id: 'E37a',
    file: 'packages/sdk-compile/src/server-objects.ts',
    at: 'line 145',
    why: 'Helpers for standalone op source: imported names (for the usage check), local function lookup (for shorthand ops), and the extractor itself (method wrap + TS strip + import-use warning).',
    note: '',
    mode: 'before',
    anchor: `function readDefinition(file: string, exportName: string, arg: ts.ObjectLiteralExpression, dir: string): DiscoveredServerObject {`,
    code: `/**
 * Standalone op source — see opSrc on DiscoveredServerObject.
 *
 * An op runs far from its module (the desktop host compiles the string with
 * new Function; later the cloud object pipeline evals it), so its body may
 * only reference its own params, its ctx, and globals. Anything else is a
 * ReferenceError at runtime — which is why discovery checks the stripped
 * source against the file's own imports and warns naming both.
 */

/** Local names bound by value imports (import type never reaches runtime). */
function importedValueNames(sf: ts.SourceFile): Set<string> {
  const names = new Set<string>()
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || st.importClause?.isTypeOnly) continue
    const clause = st.importClause
    if (!clause) continue
    if (clause.name) names.add(clause.name.text)
    const nb = clause.namedBindings
    if (nb && ts.isNamespaceImport(nb)) names.add(nb.name.text)
    else if (nb && ts.isNamedImports(nb)) {
      for (const el of nb.elements) names.add(el.name.text)
    }
  }
  return names
}

/** A top-level function name or const arrow the shorthand may point at. */
function findLocalFunction(sf: ts.SourceFile, name: string): ts.Node | null {
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name?.text === name) return st
    if (ts.isVariableStatement(st)) {
      for (const decl of st.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || decl.name.text !== name || !decl.initializer) continue
        const init = decl.initializer
        if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) return init
      }
    }
  }
  return null
}

/**
 * One op as a standalone JS expression string, or null with a warning.
 *
 * Method shorthand (async append(ctx, p) {…}) is not an expression, so it is
 * wrapped as an object member access. TypeScript is stripped with esbuild.
 * Import usage is checked against the STRIPPED source, so type-only imports
 * never warn — only values that would ReferenceError at runtime.
 */
function opExpressionText(
  opName: string,
  prop: ts.PropertyAssignment | ts.MethodDeclaration | ts.ShorthandPropertyAssignment,
  sf: ts.SourceFile,
  rel: string,
  warnings: string[],
): string | null {
  const fail = (why: string): null => {
    warnings.push('server object op "' + opName + '" in ' + rel + ' ' + why + ' — it keeps its name but ships no runnable source')
    return null
  }
  let expr: string
  if (ts.isMethodDeclaration(prop)) {
    expr = '({' + prop.getText() + '})[' + JSON.stringify(opName) + ']'
  } else if (ts.isShorthandPropertyAssignment(prop)) {
    const target = findLocalFunction(sf, prop.name.text)
    if (!target) return fail('is a shorthand for something declared outside this file')
    expr = '(' + target.getText() + ')'
  } else {
    const init = prop.initializer
    if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
      expr = init.getText()
    } else if (ts.isIdentifier(init)) {
      const target = findLocalFunction(sf, init.text)
      if (!target) return fail('points at "' + init.text + '", which is declared outside this file')
      expr = '(' + target.getText() + ')'
    } else {
      return fail('is not a function')
    }
  }
  let js: string
  try {
    js = esbuild.transformSync(expr, { loader: 'ts' }).code.trim().replace(/;+$/g, '')
  } catch (err) {
    return fail('does not strip cleanly (' + (err instanceof Error ? err.message : String(err)) + ')')
  }
  for (const name of importedValueNames(sf)) {
    if (new RegExp('\\\\b' + name + '\\\\b').test(js)) {
      warnings.push(
        'server object op "' + opName + '" in ' + rel + ' uses imported name "' + name + '" — standalone op source cannot see module imports, so this fails at runtime. Inline the helper.',
      )
      break
    }
  }
  return js
}

`,
  },
  {
    id: 'E37b',
    file: 'packages/sdk-compile/src/server-objects.ts',
    at: 'line 145',
    why: 'readDefinition takes the source file (for shorthand lookup) and warnings (for op-level diagnostics).',
    note: '',
    mode: 'replace',
    anchor: `function readDefinition(file: string, exportName: string, arg: ts.ObjectLiteralExpression, dir: string): DiscoveredServerObject {`,
    code: `function readDefinition(file: string, exportName: string, arg: ts.ObjectLiteralExpression, dir: string, sf: ts.SourceFile, warnings: string[]): DiscoveredServerObject {`,
  },
  {
    id: 'E37c',
    file: 'packages/sdk-compile/src/server-objects.ts',
    at: 'lines 162-181',
    why: 'Compute opSrc per op beside the name list; a data prop in ops (not a function) warns instead of silently shipping as runnable.',
    note: '',
    mode: 'replace',
    anchor: `  const ops: string[] = []
  for (const prop of opsRaw.properties) {
    if (ts.isPropertyAssignment(prop) || ts.isMethodDeclaration(prop) || ts.isShorthandPropertyAssignment(prop)) {
      ops.push(prop.name.getText().replace(/^['"]|['"]$/g, ''))
    }
  }
  if (!ops.length) {
    throw new Error(\`server object "$\{nameRaw.text}" in $\{rel} declares no ops — an object with no methods cannot run\`)
  }
  return {
    name: nameRaw.text,
    file,
    exportName,
    shape: readValue('shape') ?? { columns: [] },
    links: readValue('links') ?? {},
    computed: readValue('computed') ?? {},
    ops,
  }
}`,
    code: `  const ops: string[] = []
  const opSrc: Record<string, string> = {}
  for (const prop of opsRaw.properties) {
    if (ts.isPropertyAssignment(prop) || ts.isMethodDeclaration(prop) || ts.isShorthandPropertyAssignment(prop)) {
      const opName = prop.name.getText().replace(/^['"]|['"]$/g, '')
      ops.push(opName)
      const src = opExpressionText(opName, prop, sf, rel, warnings)
      if (src) opSrc[opName] = src
    }
  }
  if (!ops.length) {
    throw new Error(\`server object "$\{nameRaw.text}" in $\{rel} declares no ops — an object with no methods cannot run\`)
  }
  return {
    name: nameRaw.text,
    file,
    exportName,
    shape: readValue('shape') ?? { columns: [] },
    links: readValue('links') ?? {},
    computed: readValue('computed') ?? {},
    ops,
    opSrc,
  }
}`,
  },
  {
    id: 'E37d',
    file: 'packages/sdk-compile/src/server-objects.ts',
    at: 'line 211',
    why: 'Thread sf + warnings into readDefinition at the call site.',
    note: '',
    mode: 'replace',
    anchor: `      const decl = readDefinition(file, found[0]!.exportName, found[0]!.arg, dir)`,
    code: `      const decl = readDefinition(file, found[0]!.exportName, found[0]!.arg, dir, sf, warnings)`,
  },
  {
    id: 'E38',
    file: 'packages/morgana-cli/src/lib/host-context.mjs',
    at: 'line 162',
    why: 'Document the opaque desktop option: built by the backend package, carried verbatim.',
    note: '',
    mode: 'after',
    anchor: ` * @param {(name: string) => Promise<unknown>} [opts.runAction] action → action`,
    code: `
 * @param {{ os: unknown, app: unknown, objects: unknown }} [opts.desktop] opaque desktop surface (built by the backend package) attached verbatim as ctx.desktop`,
  },
  {
    id: 'E39',
    file: 'packages/morgana-cli/src/lib/host-context.mjs',
    at: 'lines 243-245',
    why: 'Attach ctx.desktop when the backend provides it. Opaque on purpose: this host knows actions, never sheets or windows.',
    note: '',
    mode: 'replace',
    anchor: `  const ctx = {
    args,
    ai,`,
    code: `  const ctx = {
    args,
    // The desktop lane. Opaque on purpose: this host knows "actions", never
    // "sheets" or "windows" — the backend package builds ctx.desktop (os, app,
    // objects) and this host only carries it. Absent on the cloud/web lanes.
    ...(opts.desktop ? { desktop: opts.desktop } : {}),
    ai,`,
  },
  {
    id: 'E40',
    file: 'packages/morgana-cli/src/commands/dev.mjs',
    at: 'line 32',
    why: 'dev() accepts the backend-built desktop surface and threads it into every invocation context.',
    note: '',
    mode: 'replace',
    anchor: `export async function dev({ dir = process.cwd(), port = Number(process.env.PORT ?? 4317) } = {}) {`,
    code: `export async function dev({ dir = process.cwd(), port = Number(process.env.PORT ?? 4317), desktop } = {}) {`,
  },
  {
    id: 'E41',
    file: 'packages/morgana-cli/src/commands/dev.mjs',
    at: 'line 76',
    why: 'Serve desktop http routes on the same host. Separate files so the cloud never sees them; merged table so the installed app is a full host.',
    note: '',
    mode: 'replace',
    anchor: `const apis = readJsonSafe('server/apis.json', [])`,
    code: `const serverApis = readJsonSafe('server/apis.json', [])
// Desktop http routes live in their own partition so the cloud never sees
// them, but this host serves both — the installed app is a full host.
const desktopApis = readJsonSafe('desktop/apis.json', [])
const apis = [...serverApis, ...desktopApis]`,
  },
  {
    id: 'E42',
    file: 'packages/morgana-cli/src/commands/dev.mjs',
    at: 'line 105',
    why: 'Dispatch falls back to dist/desktop/actions. Server first, desktop second — the compiler rejects name collisions, so order is a fallback, not a shadow.',
    note: '',
    mode: 'replace',
    anchor: `    const file = path.join(dist, 'server', 'actions', \`$\{name}.js\`)`,
    code: `    // Server first, desktop second: a server module and a desktop module may
    // never share a name (the compiler rejects the collision), so order is
    // a fallback, not a shadow.
    const file = [
      path.join(dist, 'server', 'actions', \`$\{name}.js\`),
      path.join(dist, 'desktop', 'actions', \`$\{name}.js\`),
    ].find((f) => fs.existsSync(f))`,
  },
  {
    id: 'E43',
    file: 'packages/morgana-cli/src/commands/dev.mjs',
    at: 'line 106',
    why: 'Missing check follows the fallback (no file in either partition).',
    note: '',
    mode: 'replace',
    anchor: `    if (!fs.existsSync(file)) {
      throw Object.assign(new Error(\`Action "$\{name}" is not deployed\`), { code: 'ACTION_MISSING' })
    }`,
    code: `    if (!file) {
      throw Object.assign(new Error(\`Action "$\{name}" is not deployed\`), { code: 'ACTION_MISSING' })
    }`,
  },
  {
    id: 'E44',
    file: 'packages/morgana-cli/src/commands/dev.mjs',
    at: 'line 189',
    why: 'Desktop actions are invokable on the host (ctx.actions.run reaches them) without joining the cloud deploy list.',
    note: '',
    mode: 'replace',
    anchor: `const enabledActions = (manifest.actions ?? []).map((a) => (typeof a === 'string' ? a : a?.name)).filter(Boolean)`,
    code: `const enabledActions = [...(manifest.actions ?? []), ...(manifest.desktopActions ?? [])].map((a) => (typeof a === 'string' ? a : a?.name)).filter(Boolean)`,
  },
  {
    id: 'E45',
    file: 'packages/morgana-cli/src/commands/dev.mjs',
    at: 'line 206',
    why: 'Thread the desktop surface into every invocation context.',
    note: '',
    mode: 'before',
    anchor: `    base: '',`,
    code: `    // Opaque — built by the backend package, carried verbatim (see host-context).
    desktop,
`,
  },
  {
    id: 'E46',
    file: 'packages/morgana-cli/src/commands/dev.mjs',
    at: 'line 446',
    why: 'Return runAction so backends can wire declarative cron through the same dispatcher actions use.',
    note: '',
    mode: 'replace',
    anchor: `return { server, shutdown }`,
    code: `return { server, shutdown, runAction }`,
  },
  {
    id: 'E47',
    file: 'packages/morgana-cli/tsup.config.ts',
    at: 'lines 3-7',
    why: 'Document the second entry: the host library backend packages import.',
    note: '',
    mode: 'replace',
    anchor: ` * Bundle the CLI to one file.
 *
 * \`bin/morgana.mjs\` is the entry; the commands under \`src/\` become internal`,
    code: ` * Bundle the CLI — the binary plus the host library.
 *
 * \`bin/morgana.mjs\` is the binary entry; \`src/host.mjs\` is the library entry
 * backend packages import (\`@morgana/cli/host\`). The commands under \`src/\` become internal`,
  },
  {
    id: 'E48',
    file: 'packages/morgana-cli/tsup.config.ts',
    at: 'entry line',
    why: 'Build dist/host.js alongside the binary.',
    note: '',
    mode: 'replace',
    anchor: `  entry: { morgana: 'bin/morgana.mjs' },`,
    code: `  entry: { morgana: 'bin/morgana.mjs', host: 'src/host.mjs' },`,
  },
  {
    id: 'E49',
    file: 'packages/morgana-cli/package.json',
    at: 'bin block',
    why: 'Export the host library subpath for backend packages.',
    note: '',
    mode: 'after',
    anchor: `  "bin": {
    "morgana": "./dist/morgana.js"
  },`,
    code: `
  "exports": {
    ".": "./dist/morgana.js",
    "./host": "./dist/host.js"
  },`,
  },
  {
    id: 'E51',
    file: 'packages/morgana-cli/src/commands/build.mjs',
    at: 'server actions row',
    why: 'Report the desktop lane in build output beside the server lane.',
    note: '',
    mode: 'after',
    anchor: `  say(row('server actions', result.serverActions.join(', ') || '(none)'))`,
    code: `
  say(row('desktop actions', result.desktopActions.join(', ') || '(none)'))`,
  },
  {
    id: 'E52',
    file: 'pnpm-workspace.yaml',
    at: 'packages list',
    why: 'Register the new public backend package in the workspace.',
    note: '',
    mode: 'replace',
    anchor: `  - packages/morgana-cli
  - examples/*`,
    code: `  - packages/morgana-cli
  - packages/desktop-electron
  - examples/*`,
  },
  {
    id: 'E53',
    file: 'pnpm-workspace.yaml',
    at: 'comment line',
    why: 'Four published packages become five.',
    note: '',
    mode: 'replace',
    anchor: `# Naming the four published packages makes the boundary explicit and keeps it`,
    code: `# Naming the five published packages makes the boundary explicit and keeps it`,
  },
  {
    id: 'E54',
    file: 'examples/sdk-compile-demo/morgana.config.ts',
    at: 'apps block',
    why: 'Demo declares the lane: a desktop app with bundle identity plus the os capability list the notes action uses.',
    note: '',
    mode: 'replace',
    anchor: `  apps: {
    main: { displayName: 'Main Storefront' },
  },`,
    code: `  apps: {
    main: { displayName: 'Main Storefront' },
    shop: {
      displayName: 'Shop Desktop',
      type: 'desktop',
      platform: { bundleId: 'com.morgana.shop' },
      pages: ['landing'],
    },
  },
  // The desktop lane: the OS groups desktop actions may use. A desktop action
  // reaching for anything outside this list gets a named error, not undefined.
  desktop: { os: ['clipboard', 'notify'] },`,
  },
  {
    id: 'E55',
    file: 'examples/sdk-compile-demo/build.mjs',
    at: 'server actions row',
    why: 'Demo build output reports the desktop lane like the CLI build does.',
    note: '',
    mode: 'after',
    anchor: `console.log('server actions: ', result.serverActions.join(', ') || '(none)')`,
    code: `
console.log('desktop actions:', result.desktopActions.join(', ') || '(none)')`,
  },
  {
    id: 'E56',
    file: 'pnpm-workspace.yaml',
    at: 'line 22',
    why: 'Block electron postinstall by default (downloads the launcher binary). Default installs never touch Electron: build, typecheck and tests do not need it. When you actually want to open the app, install the binary on demand (see README) — without it, `morgana desktop` fails with a named error, not a TypeError.',
    note: '',
    mode: 'replace',
    anchor: `  electron: true`,
    code: `  electron: false`,
  },
  {
    id: 'E61',
    file: 'packages/sdk/src/contexts/desktop.ts',
    at: 'DesktopOsGroup',
    why: 'Admit dialog + window capability groups. The gate in os.ts enforces declaration; the union is what makes a typo a type error.',
    note: '',
    mode: 'replace',
    anchor: `export type DesktopOsGroup = 'fs' | 'clipboard' | 'notify' | 'shell'`,
    code: `export type DesktopOsGroup = 'fs' | 'clipboard' | 'notify' | 'shell' | 'dialog' | 'window'`,
  },
  {
    id: 'E62',
    file: 'packages/sdk/src/contexts/desktop.ts',
    at: 'after DesktopOsShell',
    why: 'Dialog + full window-control interfaces. Window goes beyond swizzy (maximize/fullscreen/bounds/title) because a device-only subset would force the next app to fork the backend.',
    note: '',
    mode: 'after',
    anchor: `export interface DesktopOsShell {
  openPath(path: string): Promise<string>
  openUrl(url: string): Promise<void>
}`,
    code: `

/** Native dialogs. Every picker resolves null when the user cancels. */
export interface DesktopOsDialog {
  openFiles(opts?: { title?: string; dir?: string; multi?: boolean }): Promise<string[] | null>
  saveFile(opts?: { title?: string; dir?: string; name?: string }): Promise<string | null>
  message(opts: { title: string; body: string; kind?: 'info' | 'warn' | 'error' }): Promise<void>
}

/**
 * Full window control. This is swizzy's surface (minimize/close/drag/focus)
 * plus the obvious beyond (maximize/fullscreen/bounds/title/visibility).
 * Drag deltas are clamped to the work area by the backend, so a fling can
 * never strand the window off-screen.
 */
export interface DesktopOsWindow {
  minimize(): Promise<void>
  maximize(): Promise<void>
  unmaximize(): Promise<void>
  isMaximized(): Promise<boolean>
  close(): Promise<void>
  hide(): Promise<void>
  show(): Promise<void>
  focus(): Promise<void>
  isVisible(): Promise<boolean>
  setTitle(title: string): Promise<void>
  getBounds(): Promise<{ x: number; y: number; width: number; height: number }>
  setBounds(bounds: { x?: number; y?: number; width?: number; height?: number }): Promise<void>
  center(): Promise<void>
  fullscreen(on: boolean): Promise<void>
  isFullscreen(): Promise<boolean>
  setAlwaysOnTop(on: boolean): Promise<void>
  /** Move by pointer delta, clamped so the window can never get stuck off-screen. */
  drag(dx: number, dy: number): Promise<void>
}`,
  },
  {
    id: 'E63',
    file: 'packages/sdk/src/contexts/desktop.ts',
    at: 'DesktopOsHandle',
    why: 'Expose dialog + window on the handle.',
    note: '',
    mode: 'replace',
    anchor: `  notify: DesktopOsNotify
  shell: DesktopOsShell
}`,
    code: `  notify: DesktopOsNotify
  shell: DesktopOsShell
  dialog: DesktopOsDialog
  window: DesktopOsWindow
}`,
  },
  {
    id: 'E64a',
    file: 'packages/sdk/src/config.ts',
    at: 'before AppDefinition',
    why: 'Bezel declaration: per-app window chrome. Framed unless declared otherwise — frameless without drag CSS is a trapped window.',
    note: '',
    mode: 'before',
    anchor: `/** An app declared in the config — the primary definition; pages attach by name. */`,
    code: `/**
 * Window chrome for an installed desktop binary. Every field optional;
 * absent means a plain framed window at the backend default size.
 */
export interface DesktopWindow {
  width?: number
  height?: number
  frameless?: boolean
  transparent?: boolean
  resizable?: boolean
  title?: string
}

`,
  },
  {
    id: 'E64b',
    file: 'packages/sdk/src/config.ts',
    at: 'AppDefinition tail',
    why: 'Window chrome field on the app definition, desktop-only like platform.',
    note: '',
    mode: 'replace',
    anchor: `  /** Desktop identity. Only read when \`type\` is \`'desktop'\`. */
  platform?: DesktopPlatform
}`,
    code: `  /** Desktop identity. Only read when \`type\` is \`'desktop'\`. */
  platform?: DesktopPlatform
  /** Window chrome. Only read when \`type\` is \`'desktop'\`. Absent = plain framed window. */
  window?: DesktopWindow
}`,
  },
  {
    id: 'E65b',
    file: 'packages/sdk/src/index.ts',
    at: 'config export line',
    why: 'Export DesktopWindow beside the other config types.',
    note: '',
    mode: 'replace',
    anchor: `AppDefinition, AiProviderConfig, DesktopConfig } from './config'`,
    code: `AppDefinition, DesktopWindow, AiProviderConfig, DesktopConfig } from './config'`,
  },
  {
    id: 'E66',
    file: 'packages/sdk-compile/src/ir.ts',
    at: 'AppNode',
    why: 'IR carries window chrome for desktop apps so emit can write it to app.json.',
    note: '',
    mode: 'replace',
    anchor: `  /** Desktop identity — only meaningful when \`type\` is \`'desktop'\`. */
  platform?: { bundleId: string; icon?: string }
}`,
    code: `  /** Desktop identity — only meaningful when \`type\` is \`'desktop'\`. */
  platform?: { bundleId: string; icon?: string }
  /** Window chrome — only meaningful when \`type\` is \`'desktop'\`. */
  window?: { width?: number; height?: number; frameless?: boolean; transparent?: boolean; resizable?: boolean; title?: string }
}`,
  },
  {
    id: 'E57',
    file: 'packages/morgana-cli/src/commands.mjs',
    at: 'desktop row',
    why: 'Register `morgana package [web|desktop]` before the desktop row. Shorts stay unique in-row (d only); minify/outDir have no short. The generic command-table test picks the row up automatically.',
    note: '',
    mode: 'before',
    anchor: `  desktop: {`,
    code: `  package: {
    describe: 'build a shippable package — web dist/ or the desktop installer',
    usage: 'morgana package [web|desktop] [--dir <path>]',
    flags: {
      ...MINIFY_FLAGS,
      dir: { type: 'string', short: 'd', describe: 'project directory' },
      outDir: { type: 'string', describe: 'installer project directory (desktop only)' },
    },
    async run(args, { str, positional }) {
      const { packageTarget } = await import('./commands/package.mjs')
      await packageTarget({
        target: positional(args, 0, 'web'),
        dir: str(args, 'dir') || process.cwd(),
        minify: minifyRequested(args),
        outDir: str(args, 'outDir'),
      })
    },
  },

`,
  },
  {
    id: 'E58',
    file: 'packages/morgana-cli/src/commands.mjs',
    at: 'desktop row',
    why: '`morgana desktop` opens the app — it runs it. No subcommand: building moved to `morgana package desktop`, so the row stops advertising (dev|package) and always runs.',
    note: '',
    mode: 'replace',
    anchor: `  desktop: {
    describe: 'run or package the installed desktop app',
    usage: 'morgana desktop [dev|package] [--dir <path>] [--port <n>]',
    flags: {
      ...MINIFY_FLAGS,
      port: { type: 'string', short: 'P', describe: 'port (default 4317, or $PORT)' },
      dir: { type: 'string', short: 'd', describe: 'project directory' },
    },
    async run(args, { str, positional }) {
      const { desktop } = await import('./commands/desktop.mjs')
      await desktop({
        sub: positional(args, 0, 'dev'),
        dir: str(args, 'dir') || process.cwd(),
        port: Number(str(args, 'port') || process.env.PORT || 4317),
        minify: minifyRequested(args),
      })
    },
  },`,
    code: `  desktop: {
    describe: 'open the desktop app — compiles, boots the host, opens the window',
    usage: 'morgana desktop [--dir <path>] [--port <n>]',
    flags: {
      ...MINIFY_FLAGS,
      port: { type: 'string', short: 'P', describe: 'port (default 4317, or $PORT)' },
      dir: { type: 'string', short: 'd', describe: 'project directory' },
    },
    async run(args, { str }) {
      const { desktop } = await import('./commands/desktop.mjs')
      await desktop({
        dir: str(args, 'dir') || process.cwd(),
        port: Number(str(args, 'port') || process.env.PORT || 4317),
        minify: minifyRequested(args),
      })
    },
  },`,
  },
  {
    id: 'E60',
    file: 'packages/desktop-electron/src/index.ts',
    at: 'electron resolve',
    why: 'Named error when the Electron binary is missing (default installs skip it) instead of a TypeError on undefined app — launching tells you the exact on-demand install command.',
    note: '',
    mode: 'after',
    anchor: `  const electron = (await import(resolveInstalled('electron'))) as unknown as ElectronModule`,
    code: `
  if (!electron.app?.whenReady || typeof electron.BrowserWindow !== 'function') {
    throw new Error(
      'Electron did not load a runnable app module — its postinstall binary is missing. ' +
      'Install it on demand with \`pnpm --filter @morgana/desktop-electron rebuild electron\`, then retry.',
    )
  }`,
  },
  {
    id: 'E67',
    file: 'packages/sdk-compile/src/index.ts',
    at: 'seedFromConfig apps.set',
    why: 'Window chrome flows config → IR alongside platform. Explicit per-key allowlist keeps app.json clean and unknown keys out.',
    note: '',
    mode: 'after',
    anchor: `        ...(type === 'desktop' && appDef.platform?.bundleId
          ? {
              platform: {
                bundleId: appDef.platform.bundleId,
                ...(appDef.platform.icon ? { icon: appDef.platform.icon } : {}),
              },
            }
          : {}),`,
    code: `
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
          : {}),`,
  },
  {
    id: 'E68a',
    file: 'packages/sdk-compile/src/index.ts',
    at: 'buildDesktopDecl signature',
    why: 'Decl type carries window chrome to app.json.',
    note: '',
    mode: 'replace',
    anchor: `): { backend: string; os: string[]; apps: Array<{ name: string; displayName?: string; bundleId: string; icon?: string }> } | undefined {`,
    code: `): { backend: string; os: string[]; apps: Array<{ name: string; displayName?: string; bundleId: string; icon?: string; window?: { width?: number; height?: number; frameless?: boolean; transparent?: boolean; resizable?: boolean; title?: string } }> } | undefined {`,
  },
  {
    id: 'E68b',
    file: 'packages/sdk-compile/src/index.ts',
    at: 'buildDesktopDecl apps map',
    why: 'Window chrome copied from the IR app node (already allowlisted at seed).',
    note: '',
    mode: 'after',
    anchor: `      bundleId: def.platform?.bundleId ?? 'com.morgana.' + name,
      ...(def.platform?.icon ? { icon: def.platform.icon } : {}),`,
    code: `
      ...(def.window ? { window: { ...def.window } } : {}),`,
  },
  {
    id: 'E70a',
    file: 'packages/desktop-electron/src/os.ts',
    at: 'OsBackend interface',
    why: 'Backend slots for dialog + window groups, mirroring the SDK shapes.',
    note: '',
    mode: 'after',
    anchor: `  shell: {
    openPath(p: string): Promise<string>
    openUrl(url: string): Promise<void>
  }`,
    code: `
  dialog: {
    openFiles(opts?: { title?: string; dir?: string; multi?: boolean }): Promise<string[] | null>
    saveFile(opts?: { title?: string; dir?: string; name?: string }): Promise<string | null>
    message(opts: { title: string; body: string; kind?: 'info' | 'warn' | 'error' }): Promise<void>
  }
  window: {
    minimize(): Promise<void>
    maximize(): Promise<void>
    unmaximize(): Promise<void>
    isMaximized(): Promise<boolean>
    close(): Promise<void>
    hide(): Promise<void>
    show(): Promise<void>
    focus(): Promise<void>
    isVisible(): Promise<boolean>
    setTitle(title: string): Promise<void>
    getBounds(): Promise<{ x: number; y: number; width: number; height: number }>
    setBounds(bounds: { x?: number; y?: number; width?: number; height?: number }): Promise<void>
    center(): Promise<void>
    fullscreen(on: boolean): Promise<void>
    isFullscreen(): Promise<boolean>
    setAlwaysOnTop(on: boolean): Promise<void>
    drag(dx: number, dy: number): Promise<void>
  }`,
  },
  {
    id: 'E70b',
    file: 'packages/desktop-electron/src/os.ts',
    at: 'KNOWN',
    why: 'Gate knows the two new groups.',
    note: '',
    mode: 'replace',
    anchor: `const KNOWN: DesktopOsGroup[] = ['fs', 'clipboard', 'notify', 'shell']`,
    code: `const KNOWN: DesktopOsGroup[] = ['fs', 'clipboard', 'notify', 'shell', 'dialog', 'window']`,
  },
  {
    id: 'E70c',
    file: 'packages/desktop-electron/src/os.ts',
    at: 'getters tail',
    why: 'Lazy getters for dialog + window through the same need() gate.',
    note: '',
    mode: 'replace',
    anchor: `    get shell() {
      return need('shell')
    },
  }
}`,
    code: `    get shell() {
      return need('shell')
    },
    get dialog() {
      return need('dialog')
    },
    get window() {
      return need('window')
    },
  }
}`,
  },
  {
    id: 'E71a',
    file: 'packages/desktop-electron/src/electron-os.ts',
    at: 'ElectronModule',
    why: 'Module surface gains dialog + screen (work-area lookup for the drag clamp) + error box for load-failure dialogs.',
    note: '',
    mode: 'after',
    anchor: `  shell: {
    openPath(p: string): Promise<string>
    openExternal(url: string): Promise<void>
  }`,
    code: `
  dialog: {
    showOpenDialog(opts: unknown): Promise<{ canceled: boolean; filePaths: string[] }>
    showSaveDialog(opts: unknown): Promise<{ canceled: boolean; filePath?: string }>
    showMessageBox(opts: unknown): Promise<unknown>
    showErrorBox(title: string, message: string): void
  }
  screen: {
    getDisplayMatching(rect: { x: number; y: number; width: number; height: number }): {
      workArea: { x: number; y: number; width: number; height: number }
    }
  }`,
  },
  {
    id: 'E71b',
    file: 'packages/desktop-electron/src/electron-os.ts',
    at: 'before safeJoin',
    why: 'Structural window type: the backend drives exactly these methods, tests fake them.',
    note: '',
    mode: 'before',
    anchor: `/** Refuse traversal before anything touches the filesystem. */`,
    code: `/** Structural slice of the window this backend drives. */
export interface ElectronWindow {
  minimize(): void
  maximize(): void
  unmaximize(): void
  isMaximized(): boolean
  close(): void
  hide(): void
  show(): void
  focus(): void
  isVisible(): boolean
  setTitle(title: string): void
  getBounds(): { x: number; y: number; width: number; height: number }
  setBounds(bounds: { x?: number; y?: number; width?: number; height?: number }): void
  center(): void
  setFullScreen(on: boolean): void
  isFullScreen(): boolean
  setAlwaysOnTop(on: boolean): void
  setPosition(x: number, y: number): void
}

`,
  },
  {
    id: 'E71c',
    file: 'packages/desktop-electron/src/electron-os.ts',
    at: 'signature',
    why: 'Backend binds to the created window: window ops need the instance.',
    note: '',
    mode: 'replace',
    anchor: `export function electronBackend(electron: ElectronModule): OsBackend {`,
    code: `export function electronBackend(electron: ElectronModule, win: ElectronWindow): OsBackend {`,
  },
  {
    id: 'E71d',
    file: 'packages/desktop-electron/src/electron-os.ts',
    at: 'impl tail',
    why: 'Dialog + full window impl. Drag ports swizzy work-area clamp (80px grab margin) so a fling never strands the window.',
    note: '',
    mode: 'replace',
    anchor: `    shell: {
      openPath: (p) => electron.shell.openPath(p),
      openUrl: (url) => electron.shell.openExternal(url),
    },
  }
}`,
    code: `    shell: {
      openPath: (p) => electron.shell.openPath(p),
      openUrl: (url) => electron.shell.openExternal(url),
    },
    dialog: {
      openFiles: async (opts: { title?: string; dir?: string; multi?: boolean } = {}) => {
        const r = await electron.dialog.showOpenDialog({
          title: opts.title,
          defaultPath: opts.dir,
          properties: ['openFile', ...(opts.multi ? ['multiSelections'] : [])],
        })
        return r.canceled ? null : r.filePaths
      },
      saveFile: async (opts: { title?: string; dir?: string; name?: string } = {}) => {
        const r = await electron.dialog.showSaveDialog({
          title: opts.title,
          defaultPath: opts.dir ?? opts.name,
        })
        return r.canceled ? null : (r.filePath ?? null)
      },
      message: async (opts: { title: string; body: string; kind?: 'info' | 'warn' | 'error' }) => {
        await electron.dialog.showMessageBox({ title: opts.title, message: opts.body, type: opts.kind ?? 'info' })
      },
    },
    window: {
      minimize: async () => win.minimize(),
      maximize: async () => win.maximize(),
      unmaximize: async () => win.unmaximize(),
      isMaximized: async () => win.isMaximized(),
      close: async () => win.close(),
      hide: async () => win.hide(),
      show: async () => win.show(),
      focus: async () => win.focus(),
      isVisible: async () => win.isVisible(),
      setTitle: async (title: string) => win.setTitle(title),
      getBounds: async () => win.getBounds(),
      setBounds: async (b: { x?: number; y?: number; width?: number; height?: number }) => win.setBounds(b),
      center: async () => win.center(),
      fullscreen: async (on: boolean) => win.setFullScreen(on),
      isFullscreen: async () => win.isFullScreen(),
      setAlwaysOnTop: async (on: boolean) => win.setAlwaysOnTop(on),
      drag: async (dx: number, dy: number) => {
        if (typeof dx !== 'number' || typeof dy !== 'number') {
          throw new Error('ctx.desktop.os.window.drag needs numeric dx/dy')
        }
        const bounds = win.getBounds()
        // Ported from swizzy: clamp every step to the display work area with
        // a grab margin, so a fling can never strand the window off-screen.
        const GRAB_PX = 80
        const wa = electron.screen.getDisplayMatching({
          x: Math.round(bounds.x + dx),
          y: Math.round(bounds.y + dy),
          width: bounds.width,
          height: bounds.height,
        }).workArea
        win.setPosition(
          Math.min(Math.max(Math.round(bounds.x + dx), wa.x + GRAB_PX - bounds.width), wa.x + wa.width - GRAB_PX),
          Math.min(Math.max(Math.round(bounds.y + dy), wa.y), wa.y + wa.height - GRAB_PX),
        )
      },
    },
  }
}`,
  },
  {
    id: 'E72a',
    file: 'packages/desktop-electron/src/index.ts',
    at: 'appJson type',
    why: 'app.json apps entries carry window chrome.',
    note: '',
    mode: 'replace',
    anchor: `  const appJson = readJson<{ backend?: string; os?: string[]; apps?: Array<{ name: string; displayName?: string; bundleId: string; icon?: string }> }>(appFile, {})`,
    code: `  const appJson = readJson<{ backend?: string; os?: string[]; apps?: Array<{ name: string; displayName?: string; bundleId: string; icon?: string; window?: { width?: number; height?: number; frameless?: boolean; transparent?: boolean; resizable?: boolean; title?: string } }> }>(appFile, {})`,
  },
  {
    id: 'E71e',
    file: 'packages/desktop-electron/src/electron-os.ts',
    at: 'BrowserWindow type',
    why: 'Constructed window carries the full ElectronWindow surface plus loader hooks, so run() binds window ops and fail dialogs with types.',
    note: '',
    mode: 'replace',
    anchor: `  BrowserWindow: new (opts: unknown) => ElectronWindow & {
    loadURL(url: string): Promise<void>
    isDestroyed(): boolean
    close(): void
    once(event: string, cb: () => void): void
    webContents: { on(event: string, cb: (...args: unknown[]) => void): void }
  }`,
    code: `  BrowserWindow: new (opts: unknown) => ElectronWindow & {
    loadURL(url: string): Promise<void>
    isDestroyed(): boolean
    close(): void
    once(event: string, cb: () => void): void
    webContents: { on(event: string, cb: (...args: any[]) => void): void }
  }`,
  },
  {
    id: 'E72b',
    file: 'packages/desktop-electron/src/index.ts',
    at: 'run() body reorder',
    why: 'Window first (chrome from app.json, framed default), os bound to it, host after, load last with ready-to-show + fail dialogs. Previous order built os before the window existed and showed a bare framed window that failed silently.',
    note: '',
    mode: 'replace',
    anchor: `  const backend = electronBackend(electron)
  const os = buildOs({ declared: appJson.os ?? [], backend })
  const primary = appJson.apps?.[0]
  const app: DesktopAppInfo = {
    name: primary?.name ?? path.basename(projectDir),
    bundleId: primary?.bundleId ?? 'com.morgana.desktop',
    version: electron.app.getVersion(),
    userDataPath: electron.app.getPath('userData'),
    isPackaged: electron.app.isPackaged,
  }
  const objects = createObjectsRuntime({
    defs: objectDefs,
    file: path.join(electron.app.getPath('userData'), 'objects.json'),
    vars: readJson<Record<string, unknown>>(path.join(dist, 'manifest.json'), {}),
    desktop: { os, app },
  })
  const desktop: DesktopApi = { os, app, objects }

  const hostHandle = await host.dev({ dir: projectDir, port, desktop })
  const addr = hostHandle.server.address()
  const actualPort = typeof addr === 'object' && addr ? addr.port : port
  void manifest

  // Declarative schedules for desktop-lane actions only. Anything without a
  // cron expression (backend-event triggers) is skipped with a note: the app
  // has no store event bus in v1, and claiming otherwise would be a schedule
  // that never fires.
  const triggers = readJson<Array<{ name: string; run: string; cron?: string; enabled?: boolean }>>(
    path.join(dist, 'desktop', 'triggers.json'),
    [],
  )
  const scheduler = new host.CronScheduler({
    runAction: (name, params) => hostHandle.runAction(name, params),
    persistFile: path.join(electron.app.getPath('userData'), 'crons.json'),
  })
  for (const t of triggers) {
    if (!t.cron) {
      console.log('[morgana] skipping non-cron desktop trigger "' + t.name + '" — the app fires cron and http only')
      continue
    }
    await scheduler.schedule(t.name, { cron: t.cron, run: t.run, enabled: t.enabled })
  }
  scheduler.start()

  const win = new electron.BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: { contextIsolation: true },
  })
  await win.loadURL('http://127.0.0.1:' + actualPort + '/')`,
    code: `  const primary = appJson.apps?.[0]
  const app: DesktopAppInfo = {
    name: primary?.name ?? path.basename(projectDir),
    bundleId: primary?.bundleId ?? 'com.morgana.desktop',
    version: electron.app.getVersion(),
    userDataPath: electron.app.getPath('userData'),
    isPackaged: electron.app.isPackaged,
  }

  // The window exists before the os handle: window ops bind to this instance.
  // Framed unless declared otherwise — frameless without drag CSS is a
  // trapped window, and the safe default matters more than the pretty one.
  const chrome = primary?.window ?? {}
  const win = new electron.BrowserWindow({
    width: chrome.width ?? 1280,
    height: chrome.height ?? 800,
    frame: !(chrome.frameless ?? false),
    transparent: chrome.transparent ?? false,
    resizable: chrome.resizable ?? true,
    show: false,
    title: chrome.title ?? primary?.displayName ?? primary?.name ?? 'Morgana',
    webPreferences: { contextIsolation: true },
  })
  const backend = electronBackend(electron, win)
  const os = buildOs({ declared: appJson.os ?? [], backend })
  const objects = createObjectsRuntime({
    defs: objectDefs,
    file: path.join(electron.app.getPath('userData'), 'objects.json'),
    vars: readJson<Record<string, unknown>>(path.join(dist, 'manifest.json'), {}),
    desktop: { os, app },
  })
  const desktop: DesktopApi = { os, app, objects }

  const hostHandle = await host.dev({ dir: projectDir, port, desktop })
  const addr = hostHandle.server.address()
  const actualPort = typeof addr === 'object' && addr ? addr.port : port
  void manifest

  // Declarative schedules for desktop-lane actions only. Anything without a
  // cron expression (backend-event triggers) is skipped with a note: the app
  // has no store event bus in v1, and claiming otherwise would be a schedule
  // that never fires.
  const triggers = readJson<Array<{ name: string; run: string; cron?: string; enabled?: boolean }>>(
    path.join(dist, 'desktop', 'triggers.json'),
    [],
  )
  const scheduler = new host.CronScheduler({
    runAction: (name, params) => hostHandle.runAction(name, params),
    persistFile: path.join(electron.app.getPath('userData'), 'crons.json'),
  })
  for (const t of triggers) {
    if (!t.cron) {
      console.log('[morgana] skipping non-cron desktop trigger "' + t.name + '" — the app fires cron and http only')
      continue
    }
    await scheduler.schedule(t.name, { cron: t.cron, run: t.run, enabled: t.enabled })
  }
  scheduler.start()

  // Frameless + transparent means a failed load renders as nothing at all:
  // show on ready, never fail silently.
  win.once('ready-to-show', () => win.show())
  win.webContents.on('did-fail-load', (_event: unknown, code: number, desc: string) => {
    console.error('[morgana] window failed to load: ' + code + ' ' + desc)
    electron.dialog.showErrorBox('Failed to load', 'Could not load the app (' + code + ' ' + desc + ').')
  })
  win.webContents.on('render-process-gone', (_event: unknown, details: { reason: string; exitCode: number }) => {
    if (details.reason !== 'clean-exit') {
      console.error('[morgana] renderer gone: ' + details.reason + ' (exit ' + details.exitCode + ')')
    }
  })
  await win.loadURL('http://127.0.0.1:' + actualPort + '/')`,
  },
]

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const ARGS = new Set(process.argv.slice(2))
const DRY = ARGS.has('--dry-run')
const STATUS = ARGS.has('--status')
const FORCE = ARGS.has('--force')

const lineOf = (text, idx) => text.slice(0, idx).split('\n').length
let failed = 0
let applied = 0
let skipped = 0

function reportFile(entry, state, detail) {
  console.log('[' + state + '] ' + entry.id + '  ' + entry.path + (detail ? '  — ' + detail : ''))
}

for (const entry of FILES) {
  const full = path.join(ROOT, entry.path)
  const eolOf = (t) => (t.includes('\r\n') ? '\r\n' : '\n')
  const composedBy = (text) => EDITS.filter((e) => e.file === entry.path && text.includes(e.code.split('\n').join(eolOf(text)))).map((e) => e.id)
  if (STATUS) {
    let state = 'missing'
    try {
      const cur = fs.readFileSync(full, 'utf8')
      state = cur === entry.content ? 'applied' : (composedBy(cur).length ? 'composed' : 'differs')
    } catch { state = 'missing' }
    reportFile(entry, state, entry.why.split('.')[0])
    continue
  }
  if (DRY) {
    reportFile(entry, 'create', entry.path + ' (' + entry.content.split('\n').length + ' lines) — ' + entry.why.split('.')[0])
    continue
  }
  let existing = null
  try { existing = fs.readFileSync(full, 'utf8') } catch { existing = null }
  if (existing === entry.content) { skipped++; reportFile(entry, 'already', 'identical'); continue }
  if (existing !== null) {
    const owned = composedBy(existing)
    if (owned.length) { skipped++; reportFile(entry, 'composed', owned.join(',') + ' own this delta'); continue }
  }
  if (existing !== null && !FORCE) {
    failed++
    reportFile(entry, 'CONFLICT', 'exists with different content — review, then re-run with --force')
    continue
  }
  if (existing !== null) {
    const owned = composedBy(existing)
    if (owned.length) {
      skipped++
      reportFile(entry, 'composed', owned.join(',') + ' own this delta — FILES left alone (fold into FILES to silence)')
      continue
    }
  }
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, entry.content, 'utf8')
  applied++
  reportFile(entry, existing === null ? 'created' : 'overwrote', null)
}

for (const edit of EDITS) {
  const full = path.join(ROOT, edit.file)
  if (STATUS) {
    let text = null
    try { text = fs.readFileSync(full, 'utf8') } catch { text = null }
    reportFile(edit, text !== null && (text.includes(edit.code) || (text.includes('\r\n') && text.includes(edit.code.split('\n').join('\r\n')))) ? 'applied' : 'pending', edit.at + ' — ' + edit.why.split('.')[0])
    continue
  }
  let text
  try {
    text = fs.readFileSync(full, 'utf8')
  } catch {
    failed++
    reportFile(edit, 'MISSING FILE', edit.file)
    continue
  }
  // Line endings: the checkout uses CRLF, the script authors LF. Match
  // either, and insert with the file's own ending so diffs stay clean.
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const code = eol === '\n' ? edit.code : edit.code.split('\n').join(eol)
  if (text.includes(code)) { skipped++; reportFile(edit, 'already', edit.file + ' ' + edit.at); continue }
  let anchor = edit.anchor
  let first = text.indexOf(anchor)
  if (first === -1 && eol !== '\n') {
    anchor = edit.anchor.split('\n').join(eol)
    first = text.indexOf(anchor)
  }
  if (first === -1) { failed++; reportFile(edit, 'NO ANCHOR', edit.file + ' ' + edit.at); continue }
  if (text.indexOf(anchor, first + 1) !== -1) { failed++; reportFile(edit, 'ANCHOR NOT UNIQUE', edit.file + ' ' + edit.at); continue }
  if (DRY) { reportFile(edit, edit.mode, edit.file + ':' + lineOf(text, first) + ' (' + edit.at + ') — ' + edit.why.split('.')[0]); continue }
  let next
  if (edit.mode === 'after') next = text.slice(0, first + anchor.length) + code + text.slice(first + anchor.length)
  else if (edit.mode === 'before') next = text.slice(0, first) + code + text.slice(first)
  else if (edit.mode === 'replace') next = text.slice(0, first) + code + text.slice(first + anchor.length)
  else { failed++; reportFile(edit, 'BAD MODE', String(edit.mode)); continue }
  fs.writeFileSync(full, next, 'utf8')
  applied++
  reportFile(edit, 'applied', edit.file + ':' + lineOf(text, first))
}

console.log('')
console.log('applied: ' + applied + '   already: ' + skipped + '   failed: ' + failed)
if (failed) {
  console.log('Fix the failures in THIS file (anchors or code), then re-run. Nothing half-applied: each item is atomic.')
  process.exitCode = 1
} else if (!DRY && !STATUS) {
  console.log('Done. Verify: pnpm install, then the build/typecheck/test order in this file header.')
}
