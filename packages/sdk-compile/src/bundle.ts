/**
 * Bundling — the compiler's module layer.
 *
 * Actions are real modules: they may import siblings, shared helpers and
 * third-party packages from `node_modules`. esbuild resolves and inlines the
 * whole graph, one profile per lane:
 *
 *   compile  platform:node  format:cjs   evaluated in-process (no temp files)
 *   server   platform:node  format:esm   one self-contained file per action
 *   browser  platform:browser format:iife one pass over every browser action
 *
 * `@morgana/sdk` is never resolved from the project — author projects don't
 * depend on it at runtime (the factories are identity helpers and the rest is
 * types). The plugin below redirects it to the SDK's real source so action
 * code that imports a runtime value (`defineClientAction`, a token list, a
 * catalog) gets the genuine implementation, not a stand-in.
 */

import fs from 'node:fs'
import path from 'node:path'
import { createRequire, isBuiltin } from 'node:module'
import { fileURLToPath } from 'node:url'
import esbuild from 'esbuild'
import ts from 'typescript'
import type { Plugin } from 'esbuild'
import type { SdkActionMeta } from './extract'

/** Export name the generated entries use to hand a handler back to the compiler. */
const HANDLER_EXPORT = '__morganaHandler'

/** CJS evaluation shims for the compile lane. */
const CJS_MODULE = 'module'
const CJS_EXPORTS = 'exports'
const CJS_REQUIRE = 'require'
const CJS_FILENAME = '__filename'
const CJS_DIRNAME = '__dirname'

export interface BundleOptions {
  /** Project root — esbuild resolves `node_modules` from here. */
  projectDir: string
  /** The action file being bundled. */
  file: string
  /** Action name, used in error messages. */
  name: string
  /** How the action exports its handler — decides which export we pick. */
  factory: SdkActionMeta['factory']
  /** Whether the author's handler is `async` — preserved in server output. */
  async?: boolean
  /** Strip comments and shorten identifiers in the emitted module. */
  minify?: boolean
}

function currentDir(): string {
  try {
    return path.dirname(fileURLToPath(import.meta.url))
  } catch {
    return process.cwd()
  }
}

let sdkEntryCache: string | null = null
let runtimeEntryCache: string | null = null

/**
 * Absolute path to the page runtime's own source. The runtime is TypeScript
 * that reuses the style resolver, so it is bundled from source rather than
 * reimplemented as generated text — the source ships with the package.
 */
export function resolveClientRuntimeEntry(): string {
  if (runtimeEntryCache) return runtimeEntryCache
  const here = currentDir()
  const candidates = [
    path.resolve(here, 'client', 'runtime.ts'),
    path.resolve(here, '..', 'src', 'client', 'runtime.ts'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      runtimeEntryCache = candidate
      return candidate
    }
  }
  throw new Error(
    `cannot locate the page runtime source (looked in ${candidates.join(' and ')}) — ` +
      'the package must ship its src/ directory to build client.js',
  )
}

/**
 * Absolute path to the SDK's source entry.
 *
 * This resolves the SDK's *package root* rather than guessing a relative path to
 * it, because the guess only ever worked inside this monorepo. It looked for
 * `../../sdk/src/index.ts`, which holds when the compiler sits in
 * `packages/sdk-compile` beside `packages/sdk`, and holds nowhere else: installed
 * from npm the path is `node_modules/@morgana/sdk-compile/dist`, three levels
 * above nothing. It then fell back to `require.resolve('@morgana/sdk')`, which
 * answers the *bundled* `dist/index.js` — and that bundle has no
 * `export { … } from './…'` lines left in it, because tsup collapses them into
 * one `export { … }` at the end. So the module map came back empty and every
 * action that imported a value from `@morgana/sdk` failed to bundle with
 * `No matching export`, from a cause three steps removed.
 *
 * Asking for the package's own `package.json` gives the root in both layouts —
 * in the workspace it resolves through the symlink to `packages/sdk`, installed
 * it resolves to `node_modules/@morgana/sdk` — and from there `src/index.ts` is
 * one fixed step. The `@morgana/sdk` package ships that `src/` deliberately, and
 * exports `./package.json` so this lookup is legal rather than accidental.
 *
 * There is no fallback to the bundled entry. If the source is not there, the
 * per-module rewriting cannot work, and pretending otherwise is what made this
 * failure hard to read.
 */
export function resolveSdkEntry(): string {
  if (sdkEntryCache) return sdkEntryCache

  const here = currentDir()
  const req = createRequire(path.join(here, 'noop.js'))

  const roots: string[] = []
  try {
    roots.push(path.dirname(req.resolve('@morgana/sdk/package.json')))
  } catch {
    // Not resolvable from here; the path candidates below still apply in a
    // workspace that has not been installed.
  }
  roots.push(path.resolve(here, '../../sdk'))
  roots.push(path.resolve(here, '..'))

  for (const root of roots) {
    const candidate = path.join(root, 'src', 'index.ts')
    if (fs.existsSync(candidate)) {
      sdkEntryCache = candidate
      return candidate
    }
  }

  throw new Error(
    'cannot locate the @morgana/sdk source entry (looked for src/index.ts under ' +
      `${roots.join(', ')}). The compiler rewrites SDK imports to the module that ` +
      'declares each export, which needs the SDK\'s TypeScript source. Reinstall ' +
      '@morgana/sdk, or check that it was published with its src/ directory.',
  )
}

/**
 * Exported name → the SDK source module that declares it, read from the SDK's
 * own `index.ts`. Rewriting an import to its declaring module (rather than the
 * barrel) is what keeps the event/trackable catalogs out of bundles that only
 * wanted a factory function.
 */
let sdkModuleMapCache: Map<string, string> | null = null

function sdkModuleMap(): Map<string, string> {
  if (sdkModuleMapCache) return sdkModuleMapCache
  const entry = resolveSdkEntry()
  const dir = path.dirname(entry)
  const map = new Map<string, string>()
  const re = /export\s+(?!type\b)\{([^}]*)\}\s*from\s*['"](\.[^'"]+)['"]/g
  const text = fs.readFileSync(entry, 'utf8')
  for (const match of text.matchAll(re)) {
    const target = path.resolve(dir, match[2] as string)
    for (const spec of (match[1] as string).split(',')) {
      const trimmed = spec.trim()
      if (!trimmed) continue
      const parts = trimmed.split(/\s+as\s+/)
      const exported = (parts[1] ?? parts[0]).trim()
      if (exported) map.set(exported, target)
    }
  }
  sdkModuleMapCache = map
  return map
}

interface SdkImport {
  /** The name the importing file binds. */
  local: string
  /** The name the SDK exports. */
  imported: string
  /** True for `import * as sdk from '@morgana/sdk'`. */
  namespace?: boolean
}

/** Read the value bindings a file takes from `@morgana/sdk`. */
function sdkImportsIn(file: string): SdkImport[] {
  let text: string
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    return []
  }
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
  const out: SdkImport[] = []
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st)) continue
    if (!ts.isStringLiteral(st.moduleSpecifier)) continue
    if (st.moduleSpecifier.text !== '@morgana/sdk') continue
    // `import type { … }` never reaches the bundler.
    if (st.importClause?.isTypeOnly) continue
    const clause = st.importClause
    if (!clause) continue
    if (clause.name) out.push({ local: clause.name.text, imported: '*', namespace: true })
    const bindings = clause.namedBindings
    if (bindings && ts.isNamespaceImport(bindings)) {
      out.push({ local: bindings.name.text, imported: '*', namespace: true })
    } else if (bindings && ts.isNamedImports(bindings)) {
      for (const el of bindings.elements) {
        out.push({ local: el.name.text, imported: (el.propertyName ?? el.name).text })
      }
    }
  }
  return out
}

const sdkPlugin: Plugin = {
  name: 'morgana-sdk',
  setup(build) {
    build.onResolve({ filter: /^@morgana\/sdk(\/.*)?$/ }, (args) => {
      const subpath = args.path.slice('@morgana/sdk'.length).replace(/^\//, '')
      if (subpath) {
        const root = path.dirname(resolveSdkEntry())
        const target = path.join(root, `${subpath}.ts`)
        if (fs.existsSync(target)) return { path: target }
      }
      return { path: 'morgana-sdk', namespace: 'morgana-sdk', pluginData: { importer: args.importer } }
    })
    build.onLoad({ filter: /^morgana-sdk$/, namespace: 'morgana-sdk' }, (args) => {
      const entry = resolveSdkEntry()
      const fallback = (): esbuild.OnLoadResult => ({
        contents: `export * from ${JSON.stringify(entry)}`,
        loader: 'ts',
        resolveDir: path.dirname(entry),
      })
      const importer = (args.pluginData as { importer?: string } | undefined)?.importer
      // Entry points and namespace imports need the whole barrel.
      if (!importer || importer === '<stdin>') return fallback()
      const imports: SdkImport[] = sdkImportsIn(importer)
      if (imports.length === 0) return { contents: 'export {}', loader: 'js' }
      if (imports.some((i) => i.namespace)) return fallback()

      const map = sdkModuleMap()
      const byModule = new Map<string, string[]>()
      for (const { local, imported } of imports) {
        const target = map.get(imported)
        if (!target) continue
        const names = byModule.get(target) ?? []
        const spec = local === imported ? imported : `${imported} as ${local}`
        if (!names.includes(spec)) names.push(spec)
        byModule.set(target, names)
      }
      if (byModule.size === 0) return { contents: 'export {}', loader: 'js' }
      const lines = [...byModule.entries()].map(
        ([target, names]) => `export { ${names.join(', ')} } from ${JSON.stringify(target)};`,
      )
      return { contents: lines.join('\n'), loader: 'js', resolveDir: path.dirname(entry) }
    })
  },
}

/** Turn esbuild diagnostics into a message that names the action and the file. */
function formatErrors(name: string, errors: esbuild.Message[]): string {
  return errors
    .map((e) => {
      if (e.location) {
        return `${name} — ${e.text} (${e.location.file}:${e.location.line}:${e.location.column})`
      }
      if (e.pluginName === 'morgana-sdk') return `${name} — ${e.text}`
      return `${name} — ${e.text}`
    })
    .join('\n')
}

async function run(
  opts: BundleOptions,
  buildOpts: esbuild.BuildOptions,
): Promise<string> {
  const result = await esbuild.build({
    absWorkingDir: opts.projectDir,
    bundle: true,
    write: false,
    logLevel: 'silent',
    target: 'es2022',
    jsx: 'transform',
    minify: opts.minify ?? false,
    ...buildOpts,
    plugins: [...(buildOpts.plugins ?? []), sdkPlugin],
  })
  if (result.errors.length > 0) {
    throw new Error(`cannot bundle action "${opts.name}":\n${formatErrors(opts.name, result.errors)}`)
  }
  const output = result.outputFiles?.[0]
  if (!output) {
    throw new Error(`cannot bundle action "${opts.name}": esbuild produced no output`)
  }
  return output.text
}

/**
 * The generated entry picks the handler the same way the host does: a factory
 * action exports a `{ config, handler }` object under its const name, a plain
 * file exports a `handle`/`run` function. One expression covers both so action
 * files keep working whichever authoring style they use.
 */
function pickHandlerExpr(modVar: string, name: string, factory: SdkActionMeta['factory']): string {
  const def = `${modVar}[${JSON.stringify(name)}]`
  if (factory === 'plain-handle') return `${modVar}.handle`
  if (factory === 'plain-run') return `${modVar}.run`
  return [
    `(function(){`,
    `  var d = ${def};`,
    `  if (typeof d === "function") return d;`,
    `  if (d && typeof d.handler === "function") return d.handler;`,
    `  return undefined;`,
    `})()`,
  ].join('\n')
}

// ── compile lane ──────────────────────────────────────────────────────────

/**
 * Bundle a compile action and run it in this process. Returns its handler.
 *
 * The CJS bundle is evaluated with real `require`/`__filename`/`__dirname` so
 * helpers importing node built-ins work exactly as they would on disk — the
 * compile lane is the one place untrusted-looking project code genuinely runs.
 */
export async function bundleCompileAction(opts: BundleOptions): Promise<(ctx: unknown) => unknown> {
  const code = await run(opts, {
    stdin: {
      contents: [
        `import * as __m from ${JSON.stringify(opts.file)};`,
        `export const ${HANDLER_EXPORT} = ${pickHandlerExpr('__m', opts.name, opts.factory)};`,
      ].join('\n'),
      resolveDir: path.dirname(opts.file),
      sourcefile: `${opts.name}.morgana-entry.ts`,
      loader: 'ts',
    },
    platform: 'node',
    format: 'cjs',
  })

  const module: { exports: Record<string, unknown> } = { exports: {} }
  const require_ = createRequire(path.join(opts.projectDir, 'noop.js'))
  const evaluate = new Function(
    CJS_MODULE,
    CJS_EXPORTS,
    CJS_REQUIRE,
    CJS_FILENAME,
    CJS_DIRNAME,
    code,
  ) as (
    m: unknown,
    e: unknown,
    r: unknown,
    f: string,
    d: string,
  ) => void

  evaluate(module, module.exports, require_, opts.file, path.dirname(opts.file))

  const handler = module.exports[HANDLER_EXPORT]
  if (typeof handler !== 'function') {
    throw new Error(
      `compile action "${opts.name}" exports no handler — use defineServerAction/defineClientAction, or export function handle(ctx)`,
    )
  }
  return handler as (ctx: unknown) => unknown
}
// ── server lane ───────────────────────────────────────────────────────────

/**
 * Warn about Node built-ins in a server action, because the sandbox has none.
 *
 * A deployed server action does not run in Node. It runs inside a QuickJS WASM
 * sandbox in a Durable Object, which exists because Cloudflare forbids
 * `eval`/`new Function`. That sandbox exposes `console` and the action's `ctx`
 * and nothing else — no module loader, no `crypto`, no `fs`.
 *
 * The failure this warns about is quiet and total. The server lane bundles with
 * `platform: 'node'`, which is right for *resolution* — packages resolve the
 * same way they would on disk — but esbuild also leaves Node built-ins external
 * on that platform. So `import { createHash } from 'node:crypto'` survives into
 * the emitted module as a bare import statement. `morgana dev` executes that file
 * with `await import()`, so it works there. The worker rewrites the module's
 * exports and evaluates the body inside a function, where `import` is a
 * SyntaxError — so the same action that passed every local check fails on
 * deploy, having compiled cleanly and reported success.
 *
 * A warning and not an error, because the action is genuinely valid under
 * `morgana dev` and the compiler cannot know whether this project will ever be
 * deployed. The two lanes run on different runtimes and the artefact is the same
 * file for both, so the author is the only one who can resolve that — which is
 * what the warning is for.
 *
 * Scoped to the server lane on purpose. The compile lane evaluates in this
 * process and legitimately uses built-ins; the browser lane already fails on
 * them, because `platform: 'browser'` will not resolve them at all.
 */
const warnNodeBuiltins = (warnings: string[]): Plugin => ({
  name: 'morgana-node-builtins',
  setup(build) {
    const reported = new Set<string>()
    build.onResolve({ filter: /^(?:node:)?[a-z]/ }, (args) => {
      if (args.namespace !== 'file' && args.namespace !== '') return null
      const spec = args.path
      const bare = spec.startsWith('node:') ? spec.slice(5) : spec
      if (!isBuiltin(bare)) return null
      // One line per specifier rather than per import site: a package pulling in
      // `node:fs` from nine files should not produce nine identical lines.
      if (!reported.has(spec)) {
        reported.add(spec)
        warnings.push(
          `${spec} is a Node built-in. This works in \`morgana dev\` and will fail on deploy.`,
        )
      }
      // Left external so the bundle still builds and still runs locally. That is
      // the point of the warning: the author sees it work, then sees this line,
      // and learns the difference before deploying rather than after.
      return { path: spec, external: true }
    })
  },
})

/**
 * Marks an action module as already-stripped, machine-generated JavaScript.
 *
 * The hosted runtime keeps a regex type-stripper for hand-written TypeScript
 * uploaded from the studio. Running that over compiled output is actively
 * harmful — it reads `export { s as handle }` and strips `as handle` as if it
 * were a TypeScript cast. The marker lets the runtime tell the two apart
 * instead of guessing.
 */
export const COMPILED_MARKER = '// @morgana-compiled'

/**
 * Bundle a server action into one self-contained ESM module exporting the
 * conventional `handle(ctx)` / `run(input)` the host dispatches on. Everything
 * the action imports is inlined; node built-ins stay external because the
 * output is meant to run on a node-compatible edge runtime.
 */
export async function bundleServerAction(opts: BundleOptions, warnings: string[] = []): Promise<string> {
  const picked = pickHandlerExpr('__m', opts.name, opts.factory)
  const isPlainRun = opts.factory === 'plain-run'
  const param = isPlainRun ? 'input' : 'ctx'
  const fname = isPlainRun ? 'run' : 'handle'
  const body = isPlainRun ? 'return __fn(input);' : 'return __fn(ctx);'

  const code = await run(opts, {
    stdin: {
      contents: [
        `import * as __m from ${JSON.stringify(opts.file)};`,
        `var __fn = ${picked};`,
        `if (typeof __fn !== "function") throw new Error(${JSON.stringify(
          `action "${opts.name}" exports no handler — use defineServerAction, or export function handle(ctx)`,
        )});`,
        `export ${opts.async ? 'async ' : ''}function ${fname}(${param}) {`,
        `  ${body}`,
        `}`,
      ].join('\n'),
      resolveDir: path.dirname(opts.file),
      sourcefile: `${opts.name}.morgana-entry.ts`,
      loader: 'ts',
    },
    platform: 'node',
    format: 'esm',
    // `run` appends the SDK plugin, so this lands after it and a bare `node:*`
    // reaches the check rather than being resolved first. The order is what
    // makes the warning the one the author sees.
    plugins: [warnNodeBuiltins(warnings ?? [])],
  })
  return `${COMPILED_MARKER}\n${code}`
}

// ── page runtime ──────────────────────────────────────────────────────────

/**
 * Bundle the page runtime into its own IIFE exposing `window.__morgana_runtime`.
 *
 * It ships separately from the author-action bundle so the runtime is available
 * before any action registers, and so a project with no browser actions still
 * gets a working `ctx.ui`.
 */
export async function bundleClientRuntime(projectDir: string, minify = false): Promise<string> {
  const entry = resolveClientRuntimeEntry()
  return run({ projectDir, file: entry, name: 'page runtime', factory: 'client', minify }, {
    stdin: {
      contents: [
        `import { makeUi } from ${JSON.stringify(entry)};`,
        'window.__morgana_runtime = { makeUi: makeUi };',
      ].join('\n'),
      resolveDir: path.dirname(entry),
      sourcefile: 'client-runtime.morgana-entry.js',
      loader: 'js',
    },
    platform: 'browser',
    format: 'iife',
  })
}

// ── custom objects ─────────────────────────────────────────────────────────

/**
 * Load a custom object component's definition in Node, so its `define` and
 * `methods` are callable from the compile lane.
 *
 * Same in-process evaluation as a compile action, different export: we want the
 * module's default export (the definition), not a handler. `define` is a real
 * function that stamps real objects into the IR, so it has to actually run.
 */
export async function loadCustomObjectDefinition(
  projectDir: string,
  file: string,
  name: string,
  minify = false,
): Promise<Record<string, unknown>> {
  const code = await run({ projectDir, file, name: `custom object "${name}"`, factory: 'client', minify }, {
    stdin: {
      contents: [
        `import __morg_def from ${JSON.stringify(file)};`,
        `export const __morganaDefinition = __morg_def;`,
      ].join('\n'),
      resolveDir: path.dirname(file),
      sourcefile: `${name}.morgana-definition.ts`,
      loader: 'ts',
    },
    platform: 'node',
    format: 'cjs',
  })

  const module: { exports: Record<string, unknown> } = { exports: {} }
  const require_ = createRequire(path.join(projectDir, 'noop.js'))
  const evaluate = new Function(
    CJS_MODULE,
    CJS_EXPORTS,
    CJS_REQUIRE,
    CJS_FILENAME,
    CJS_DIRNAME,
    code,
  ) as (m: unknown, e: unknown, r: unknown, f: string, d: string) => void

  evaluate(module, module.exports, require_, file, path.dirname(file))

  const definition = module.exports['__morganaDefinition']
  if (!definition || typeof definition !== 'object') {
    throw new Error(
      `custom object "${name}" (${path.relative(projectDir, file)}) has no default export — ` +
        'a component file must `export default createCustomObject({ name: "..." })`',
    )
  }
  return definition as Record<string, unknown>
}

/**
 * Bundle every custom object module into one browser script that registers
 * them on the page.
 *
 * Each component is imported for its default export. Importing is what runs its
 * `createCustomObject(...)` call, which is what registers it — so this is a
 * real evaluation of the component's own code, not a copy of it. A component
 * that throws at import time is a build error with the component's own stack,
 * which is the right place for it to surface.
 *
 * The registry is attached to `window.__morgana_custom` so the page runtime can
 * find a component without importing the SDK again.
 */
export async function bundleCustomObjectModules(
  projectDir: string,
  decls: Array<{ name: string; file: string }>,
  minify = false,
): Promise<string> {
  const entry = resolveSdkSource('interfaces.ts')
  const imports: string[] = []
  const registrations: string[] = []
  decls.forEach((decl, i) => {
    const spec = JSON.stringify(decl.file)
    imports.push(`import __morg_def_${i} from ${spec};`)
    registrations.push(
      `  { const d = __morg_def_${i}; if (d && typeof d === "object" && typeof d.name === "string") { d.__sourceModule = ${JSON.stringify(decl.file)}; __morg_kept.push(d); } }`,
    )
  })

  const contents = [
    `import { getCustomObject, getAllCustomObjects, isCustomObject, creatorNameFor } from ${JSON.stringify(entry)};`,
    ...imports,
    'const __morg_kept = [];',
    registrations.join('\n'),
    'window.__morgana_custom = {',
    '  get: getCustomObject,',
    '  all: getAllCustomObjects,',
    '  isCustom: isCustomObject,',
    '  creatorNameFor: creatorNameFor,',
    // Only components with browser code reach the page. A pure-`define`
    // component is compiled into real objects and ships nothing at all.
    '  runtime: __morg_kept.filter(function (d) {',
    '    return typeof d.onMount === "function" || typeof d.onUpdate === "function" ||',
    '           typeof d.onDestroy === "function" || typeof d.onPrepare === "function" ||',
    '           (d.methods && Object.keys(d.methods).length > 0);',
    '  }),',
    '};',
  ].join('\n')

  return run(
    { projectDir, file: entry, name: 'custom objects', factory: 'client', minify },
    {
      stdin: {
        contents,
        resolveDir: path.dirname(entry),
        sourcefile: 'custom-objects.morgana-entry.ts',
        loader: 'ts',
      },
      platform: 'browser',
      format: 'iife',
    },
  )
}

/** Locate an SDK source file, from either the built or the source checkout. */
export function resolveSdkSource(relative: string): string {
  const here = currentDir()
  const candidates = [
    path.resolve(here, '..', 'src', relative),
    path.resolve(here, '..', '..', 'sdk', 'src', relative),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  throw new Error(
    `cannot locate @morgana/sdk source "${relative}" (looked in ${candidates.join(' and ')}) — ` +
      'the sdk package must ship its src/ directory',
  )
}

// ── browser lane ──────────────────────────────────────────────────────────

/**
 * Bundle every browser action in one pass. They share a module scope, so a
 * helper imported by two actions is emitted once, and tree-shaking can drop
 * what nobody uses. The bundle only registers implementations on
 * `window.__morgana_actions`; the surrounding runtime supplies the context.
 */
export async function bundleBrowserActions(
  projectDir: string,
  actions: BundleOptions[],
  minify = false,
): Promise<string> {
  if (actions.length === 0) return ''
  // Imports must sit at module top level; the iife format wraps the whole entry
  // for us, so the registration statements can follow them directly.
  const lines: string[] = actions.map(
    (action, i) => `import * as __m${i} from ${JSON.stringify(action.file)};`,
  )
  lines.push('var __reg = window.__morgana_actions = window.__morgana_actions || {};')
  actions.forEach((action, i) => {
    const picked = pickHandlerExpr(`__m${i}`, action.name, action.factory)
    lines.push(
      `var __h${i} = ${picked};`,
      `if (typeof __h${i} === "function") __reg[${JSON.stringify(action.name)}] = __h${i};`,
      `else console.error("[Morgana] browser action " + ${JSON.stringify(action.name)} + " exports no handler");`,
    )
  })

  return run({ projectDir, file: '', name: 'client lane', factory: 'client', minify }, {
    stdin: {
      contents: lines.join('\n'),
      resolveDir: projectDir,
      sourcefile: 'browser-lane.morgana-entry.js',
      loader: 'js',
    },
    platform: 'browser',
    format: 'iife',
  })
}
