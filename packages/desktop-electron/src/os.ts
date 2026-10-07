/**
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
  }
}

const KNOWN: DesktopOsGroup[] = ['fs', 'clipboard', 'notify', 'shell', 'dialog', 'window']

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
    get dialog() {
      return need('dialog')
    },
    get window() {
      return need('window')
    },
  }
}
