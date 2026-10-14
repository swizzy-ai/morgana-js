/**
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
import { compileProject } from '@studiomorgana/sdk-compile'
import { dev } from '../commands/dev.mjs'

const CONFIG = [
  "import { defineConfig } from '@studiomorgana/sdk'",
  'export default defineConfig({',
  "  name: 'host-desk',",
  "  entry: 'home',",
  "  desktop: { os: ['clipboard'] },",
  '})',
].join('\n')

const SEED = [
  "import { defineClientAction } from '@studiomorgana/sdk'",
  'export const seed = defineClientAction({',
  '  config: { on: "compile" },',
  '  handler: (ctx) => {',
  "    ctx.ui.pages.create({ name: 'home', address: '/' })",
  '    return { ok: true }',
  '  },',
  '})',
].join('\n')

const PING = [
  "import { defineDesktopAction } from '@studiomorgana/sdk'",
  'export const ping = defineDesktopAction({',
  "  config: { on: 'http.get /ping', auth: 'public' },",
  '  handler: async (ctx) => ({ ok: true, platform: ctx.desktop.os.platform, app: ctx.desktop.app.name }),',
  '})',
].join('\n')

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

      // Door 3: a dev server never serves stale bytes — pages carry
      // `cache-control: no-store` so a rebuild is always what you test.
      const page = await fetch('http://127.0.0.1:' + port + '/')
      expect(page.headers.get('cache-control')).toBe('no-store')

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
