/**
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
].join('\n')

const SEED = [
  "import { defineClientAction } from '@morgana/sdk'",
  'export const seed = defineClientAction({',
  '  config: { on: "compile" },',
  '  handler: (ctx) => {',
  "    ctx.ui.pages.create({ name: 'home', address: '/' })",
  '    return { ok: true }',
  '  },',
  '})',
].join('\n')

const PING = [
  "import { defineDesktopAction } from '@morgana/sdk'",
  'export const ping = defineDesktopAction({',
  "  config: { on: 'http.get /ping', auth: 'public' },",
  '  handler: (ctx) => ({ ok: true, platform: ctx.desktop.os.platform }),',
  '})',
].join('\n')

const PONG = [
  "import { defineDesktopAction } from '@morgana/sdk'",
  'export const pong = defineDesktopAction({',
  "  config: { on: 'cron(* * * * *)' },",
  '  handler: () => ({ ok: true }),',
  '})',
].join('\n')

const PLAIN = [
  'export async function handle(ctx) {',
  '  return { ok: true, via: "folder" }',
  '}',
].join('\n')

const GREET = [
  "import { defineServerAction } from '@morgana/sdk'",
  'export const greet = defineServerAction({',
  '  handler: () => ({ greeting: "hi" }),',
  '})',
].join('\n')

const FMT = [
  'export function fmt(n: number): string {',
  '  return "n=" + n',
  '}',
].join('\n')

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
].join('\n')

const CONFIG_NODESK = [
  "import { defineConfig } from '@morgana/sdk'",
  'export default defineConfig({',
  "  name: 'desk-demo',",
  "  entry: 'home',",
  '})',
].join('\n')

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
      // `actions` and must never see this list.
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
        expect(src).not.toMatch(/:\s*any/)
        const fn = new Function('return (' + src + ')')() as (...a: unknown[]) => unknown
        expect(typeof fn, name).toBe('function')
      }
      // The method form still computes once compiled. (The fixture method is
      // sync, so this asserts the value, not a promise.)
      const incr = new Function('return (' + counter.opSrc.incr + ')')() as (ctx: unknown, p: unknown) => unknown
      expect(incr({ object: { state: { count: 2 } } }, { by: 3 })).toEqual({ count: 5 })
      // The op using the imported helper is named, not silently broken.
      expect(result.warnings.join('\n')).toContain('"bad"')
      expect(result.warnings.join('\n')).toContain('"fmt"')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)
})
