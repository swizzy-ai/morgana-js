/**
 * Icons — the named icon vocabulary (`ctx.ui.icons`).
 *
 * Shaped like the other declarative registries (breakpoints, measure,
 * transformer domains): icon sets are declared in the shape phase
 * (`on: 'compile'` actions via `ctx.ui.icons.define`) and consumed by name
 * through object `icon` props (`button({ icon: 'cart' })`). In the running
 * browser the surface is read-only (`get`/`has`) — definitions are baked at
 * compile time.
 *
 * Definition kinds:
 *   glyph   — a text symbol rendered as-is (emoji, unicode symbol)
 *   svg     — inline SVG markup, embedded verbatim
 *   asset   — a bundled asset key, resolved via `ctx.assets.url(asset)`
 *   url     — a remote/raw URL, used verbatim
 *   library — an icon from a declared JS icon library (e.g. Lucide):
 *             `{ kind: 'library', library: 'lucide', name: 'shopping-cart' }`
 *             renders `<i data-lucide="shopping-cart">` once the library's
 *             CDN script (declared alongside, see below) has run `createIcons`.
 *   file    — a project file path, rendered as an image
 *
 * Libraries (the CDN scripts icon packs ship in) are declared separately —
 * `{ cdnUrl, globalVar }` per library — mirroring how the engine's library
 * records carry the URL while actions reference names. Unknown icon keys
 * render as raw glyphs so undeclared strings keep working.
 */

export type IconDef =
  | { kind: 'glyph'; glyph: string }
  | { kind: 'svg'; svg: string }
  | { kind: 'asset'; asset: string }
  | { kind: 'url'; url: string }
  | { kind: 'library'; library: string; name: string }
  | { kind: 'file'; path: string }

/** A declared icon library — the CDN script an icon pack ships in. */
export interface IconLibraryRef {
  /** Script URL, e.g. `https://unpkg.com/lucide@latest`. */
  cdnUrl: string
  /** Window global the script exposes, e.g. `lucide`. */
  globalVar: string
  /** Pinned version, informational. */
  version?: string
}

/**
 * The icon registry — declare icon sets once (shape phase), use by key
 * everywhere. Mirrors the `BreakpointsApi` contract shape.
 */
export interface IconsApi {
  /** Define (create-or-overwrite) a named icon. */
  define(name: string, def: IconDef): void
  /** Alias of define. */
  shape(name: string, def: IconDef): void
  /** Read a defined icon (undefined when undeclared). */
  get(name: string): IconDef | undefined
  /** Is this icon name defined? */
  has(name: string): boolean
  /** Every defined icon. */
  entries(): [string, IconDef][]
  /** Remove a defined icon. */
  remove(name: string): void
}
