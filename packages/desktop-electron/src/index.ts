/**
 * Desktop backend entry — `run()` boots the app, `pack()` ships it.
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
import type { DesktopApi, DesktopAppInfo } from '@studiomorgana/sdk'
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
      'dist/desktop/app.json not found — declare the desktop lane (a desktop action or config.desktop) and run `morgana build` first',
    )
  }
  const appJson = readJson<{ backend?: string; os?: string[]; apps?: Array<{ name: string; displayName?: string; bundleId: string; icon?: string; window?: { width?: number; height?: number; frameless?: boolean; transparent?: boolean; resizable?: boolean; title?: string } }> }>(appFile, {})
  const manifest = readJson<{ entry?: string }>(path.join(dist, 'manifest.json'), {})
  const objectDefs = readJson<ObjectTypeDef[]>(path.join(dist, 'objects.json'), [])

  const host = (await import(resolveInstalled('@studiomorgana/cli/host'))) as unknown as HostModule
  const electron = (await import(resolveInstalled('electron'))) as unknown as ElectronModule
  if (!electron.app?.whenReady || typeof electron.BrowserWindow !== 'function') {
    throw new Error(
      'Electron did not load a runnable app module — its postinstall binary is missing. ' +
      'Install it on demand with `pnpm --filter @studiomorgana/desktop-electron rebuild electron`, then retry.',
    )
  }
  await electron.app.whenReady()

  const primary = appJson.apps?.[0]
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
