/**
 * The single framework config — `morgana.config.ts` (FRAMEWORK.md §10).
 *
 * One config, driven by hooks. The `on` field declares *what* to react to and
 * `run` declares which action(s) fire (sequentially, in order):
 *
 *   - `on: 'compile'`            → build-time only, runs locally at compile
 *   - `on: 'cron(every 1h)'`     → a schedule (cron)
 *   - `on: 'store.production.record.created'` → a runtime server event (store /
 *     app / action catalog events)
 *   - `on: 'http.get /widgets'`  → a public HTTP route backed by a server action
 *                                 (server actions as HTTP APIs)
 *
 * `defineConfig` is an identity helper: it exists for typed authoring and a
 * place to hang docs/defaults — configs are tooling-read modules, never
 * sandbox-executed.
 */

export type ServerApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/** CORS policy for a public API route (server actions as HTTP APIs). */
export interface ServerApiCors {
  /** Origins allowed to call the endpoint. Empty/omitted = allow all (`*`). */
  allowedOrigins?: string[]
  allowMethods?: ServerApiMethod[]
  allowHeaders?: string[]
  exposeHeaders?: string[]
  maxAge?: number
  credentials?: boolean
}

/** A public HTTP route backed by a server action. */
export interface ServerApiRoute {
  /** URL path, e.g. `/widgets` or `/widgets/:id`. */
  path: string
  method?: ServerApiMethod
  /** The server action that handles this route (internal action name). */
  action: string
  /**
   * `'public'` — no auth required (external callers OK). `'member'` (default)
   * — requires an authenticated project member, reusing existing auth.
   */
  auth?: 'public' | 'member'
  /** Per-route CORS. Omitted = allow all origins (current default). */
  cors?: ServerApiCors
}

/**
 * A hook — one reaction to an event, one schedule, one build-time pass, or one
 * public HTTP route. `run` executes its actions sequentially, in order.
 */
export interface Hook {
  /**
   * What the hook reacts to. Event / schedule / route selector, see file doc:
   *   'compile'                      → build-time only
   *   'cron(every 1h)'               → a schedule
   *   'store.<name>.record.created'  → server runtime event
   *   'http.get /path'               → public API route
   *
   * Accepts an array to wire multiple events to the same actions:
   *   on: ['store.tasks.created', 'cron(every 5m)']
   */
  on: string | string[]
  /** Action name(s) to run — sequentially, in order. */
  run: string | string[]
  /** Filter — `when` narrows the event/match by data. */
  when?: Record<string, unknown>
  /** Route auth (http hooks only): `'public'` or `'member'`. Default member. */
  auth?: 'public' | 'member'
  /** Per-route CORS (http hooks only). Omitted = allow all origins. */
  cors?: ServerApiCors
  /** Set false to disable the hook without deleting it. */
  enabled?: boolean
}

/**
 * Where a project's model calls go.
 *
 * Declared as vars rather than a top-level config block because that is what
 * `ctx.vars` already is: build-time configuration the server can read. Putting
 * the provider here rather than in a new config section means it ships through
 * the manifest that already exists and is readable at runtime by the same code
 * that reads everything else.
 *
 * `provider` defaults to `morgana`, which needs no credentials.
 */
export interface AiProviderConfig {
  /** `morgana` (default) | `openai` | `anthropic` | `ollama`. */
  provider?: 'morgana' | 'openai' | 'anthropic' | 'ollama'
  /** Required for `morgana`; optional elsewhere. */
  baseUrl?: string
  /** Model id. Each provider has its own default. */
  model?: string
  /** Required for every provider except `ollama`. Never shipped to the browser. */
  token?: string
}

/**
 * Vars exposed to server actions via `ctx.vars`.
 *
 * `ai` is named rather than left to the index signature, so a typo in a provider
 * name is a compile error instead of a runtime one.
 */
export interface ConfigVars {
  public?: Record<string, unknown>
  private?: Record<string, unknown> & { ai?: AiProviderConfig }
}

/** Per-domain declarative token changes for the `make()` vocabulary. */
export interface TransformerDomainChanges<T = unknown> {
  /** New tokens. No-op when the token already exists (prefer `update`). */
  add?: Record<string, T>
  /** Create-or-overwrite existing tokens. */
  update?: Record<string, T>
  /** Tokens to remove from the vocabulary. */
  remove?: string[]
}

/**
 * Declarative transformer tokens — applied before the compile phase, so
 * `on: 'compile'` actions (and the generated browser runtime) see them.
 * Mirrors the engine's TransformerConfig domains: effects, radius, spacing,
 * dimensions, fonts, surfaces, layout, alignment, shorthands, colors.
 */
export interface TransformerConfigChanges {
  /** Bare effect words → resolved boxShadow CSS. */
  effects?: TransformerDomainChanges<string>
  /** Bare radius words → radius token. */
  radius?: TransformerDomainChanges<string>
  /** Bare spacing words → one or more pad/gap props. */
  spacing?: TransformerDomainChanges<Array<[string, number]>>
  /** Bare dimension words → width/height writes. */
  dimensions?: TransformerDomainChanges<{ prop: string; value: string }>
  /** Bare font words → the object's `font` token. */
  fonts?: TransformerDomainChanges<string>
  /** Bare surface words → canonical surface token. */
  surfaces?: TransformerDomainChanges<string>
  /** Bare layout words → the container `layout` token. */
  layout?: TransformerDomainChanges<string>
  /** Bare alignment words → the align token. */
  alignment?: TransformerDomainChanges<string>
  /** Bare style shorthand words → concrete prop writes. */
  shorthands?: TransformerDomainChanges<Record<string, string>>
  /** Named CSS color words the color resolver recognizes. */
  colors?: TransformerDomainChanges<string>
}

/**
 * What an app is built to run as.
 *
 * `web` is the default and needs no configuration. `desktop` additionally
 * carries the identity an installed binary needs, so the difference is one
 * discriminant rather than a separate app concept.
 */
export type AppType = 'web' | 'desktop'

/** Identity for an app that ships as an installed desktop binary. */
export interface DesktopPlatform {
  /**
   * Reverse-DNS identifier, e.g. `com.acme.shop`. Required for `type: 'desktop'`
   * — it is what the OS uses to key the install and the app's data directory.
   */
  bundleId: string
  /** App icon, relative to the project's `assets/`. */
  icon?: string
}

/** An app declared in the config — the primary definition; pages attach by name. */
export interface AppDefinition {
  /** Human-readable name (falls back to the config key). */
  displayName?: string
  description?: string
  /** Page names belonging to this app — pages are still world objects. */
  pages?: string[]
  /** Omitted means `'web'`. */
  type?: AppType
  /** Desktop identity. Only read when `type` is `'desktop'`. */
  platform?: DesktopPlatform
}

/**
 * Declared apps — keyed by app name. Pages are attached by name here, at
 * runtime via `ctx.apps.app(name).addPage(page)` / `PageHandle.app(name)`, or
 * by setting `PageProps.app`.
 */

export interface MorganaConfig {
  /** Project name (matches package.json / morgana.json). */
  name?: string
  /** Primary entry point — typically the world/app root. */
  entry?: string
  /**
   * Minify the emitted output — `client.js` and every server action module.
   *
   * Off by default so builds stay readable and debuggable; turn it on for
   * anything you ship. A `compileProject` call can override it per invocation.
   */
  minify?: boolean
  /** Public + private vars — exposed on the server via `ctx.vars`. */
  vars?: ConfigVars
  /** Server bindings (collections/assets) — wired onto `ctx.server`. */
  bindings?: {
    collections?: string[]
    assets?: string
  }
  /** The project's hooks — events, schedules, compile passes, http routes. */
  hooks?: Hook[]
  /** Apps to deploy — keyed by app name. Pages are added to the app by name. */
  apps?: Record<string, AppDefinition>
  /**
   * Declarative `make()` token changes — extend/override/remove transformer
   * tokens before the compile phase bakes them into the browser runtime.
   * `on: 'compile'` actions can mutate further via `ctx.ui.transformers`.
   */
  transformers?: TransformerConfigChanges
}

export function defineConfig(config: MorganaConfig): MorganaConfig {
  return config
}
