/**
 * Apps — the project-level app objects (FRAMEWORK.md §10).
 *
 * Apps are declared in `morgana.config.ts` (`apps.<name>.pages`), and pages
 * are world objects that attach to an app by name (via `PageHandle.app(name)`
 * or `PageProps.app`). At runtime both lanes reach them through `ctx.apps`.
 *
 * On compile-time actions this surface mutates the world graph; in the running
 * app the reads (`list`/`app`/`pages`) are live and `create`/`addPage` are
 * no-ops or compile-only per the runtime.
 */

import type { PageHandle } from './handles'
import type { AppType, DesktopPlatform } from './config'

/** Metadata for a page attached to an app. */
export interface AppPage {
  name: string
  /** The page's served route (defaults to `/{name}`). */
  address: string
}

/** An app handle — pages attach by name and stay world objects. */
export interface AppHandle {
  readonly name: string
  readonly displayName?: string
  readonly description?: string
  /** What the app runs as. `'web'` unless declared otherwise. */
  readonly type: AppType
  /** Desktop identity — undefined for a web app. */
  readonly platform?: DesktopPlatform
  /** Pages attached to this app, in declaration order. */
  pages(): AppPage[]
  /** Look up an attached page by name. */
  page(name: string): AppPage | undefined
  /** Attach a page (by name or handle). Idempotent. */
  addPage(page: string | PageHandle): this
  /** Detach a page by name. Returns `this` for chaining. */
  removePage(name: string): this
}

/** Options for `ctx.apps.create`. */
export interface CreateAppOptions {
  displayName?: string
  description?: string
  /** Omitted means `'web'`. */
  type?: AppType
  /** Required when `type` is `'desktop'`; ignored otherwise. */
  platform?: DesktopPlatform
  /** Pages to attach up front. */
  pages?: string[]
}

/** Apps — the project's app objects (`config.apps` declares them). */
export interface AppsHandle {
  /** All apps, in declaration order. */
  list(): AppHandle[]
  /** An app by name, or undefined when undeclared. */
  app(name: string): AppHandle | undefined
  /**
   * Declare an app (compile-time). No-op when already declared — so a second
   * call cannot silently replace a declaration the config already made.
   */
  create(name: string, opts?: CreateAppOptions): AppHandle
  /** Remove an app by name. Returns true when one was removed. */
  remove(name: string): boolean
}