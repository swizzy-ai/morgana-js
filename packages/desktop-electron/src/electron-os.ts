/**
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
  BrowserWindow: new (opts: unknown) => ElectronWindow & {
    loadURL(url: string): Promise<void>
    isDestroyed(): boolean
    close(): void
    once(event: string, cb: () => void): void
    webContents: { on(event: string, cb: (...args: any[]) => void): void }
  }
  clipboard: {
    readText(): string
    writeText(text: string): void
  }
  shell: {
    openPath(p: string): Promise<string>
    openExternal(url: string): Promise<void>
  }
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
  }
  Notification: new (opts: { title: string; body?: string }) => {
    show(): void
  }
}

/** Structural slice of the window this backend drives. */
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

export function electronBackend(electron: ElectronModule, win: ElectronWindow): OsBackend {
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
}
