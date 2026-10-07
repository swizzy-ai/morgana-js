/**
 * The desktop lane — `ctx.desktop`.
 *
 * A desktop action runs inside the installed app, not in the cloud. It keeps
 * the whole server spine — collections, files, queue, events, vars — because
 * the app is a host, not a page: the same action code must work whether the
 * host is a laptop or a datacenter. What it adds is `ctx.desktop`:
 *
 *   os      — the machine, behind declared capability groups (fs, clipboard,
 *             notify, shell). A group the config did not declare throws a
 *             named error instead of returning undefined.
 *   app     — the installed app's identity (bundle id, version, data dir).
 *   objects — the local object runtime (types/create/get/run over
 *             dist/objects.json, persisted beside the app data).
 *
 * There is deliberately no `ctx.os` on the shared base: an unscoped name
 * would be reachable from the client lane, where there is no machine to talk
 * to. Scoped to `ctx.desktop`, the type system itself refuses it elsewhere.
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
  /** Move by pointer delta, clamped so the window can never get stuck off-screen. */
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
 * `run` returns the op's return value and persists NOTHING by itself —
 * persistence happens only through `ctx.object.set()` inside the op or
 * `set()` outside it. A computed value that nobody stores is just a value,
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
 * `ctx.server`, plus `ctx.desktop`. `C` is the action's own Contract.
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
