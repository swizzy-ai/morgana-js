/**
 * Static extraction — reads the SDK project without executing it.
 *
 * Supports both authoring patterns:
 *   1. defineServerAction/defineClientAction({ config, handler })
 *   2. plain `export function handle(ctx)` / `export function run(input)`
 *      (wiring then comes from morgana.config.ts hooks).
 */

import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import type { Hook, MorganaConfig } from '@morgana/sdk'

export type ActionLane = 'server' | 'client' | 'compile'
export type FactoryKind = 'server' | 'client' | 'plain-handle' | 'plain-run'

export interface SdkActionMeta {
  name: string
  file: string
  lane: ActionLane
  factory: FactoryKind
  on: string[]
  when?: Record<string, unknown>
  auth?: 'public' | 'member'
  cors?: unknown
  enabled: boolean
  debounce?: number
  throttle?: number
  /** Raw handler source text (function expression / arrow / declaration body owner). */
  handlerSrc: string
  /** True when the handler is `async`. */
  handlerAsync: boolean
  contract?: { input?: string; output?: string }
  /**
   * The action's JSDoc, first paragraph, when it has one.
   *
   * Read here rather than requiring a separate `tool()` registration, so a tool
   * documents itself where it is implemented — the same trick custom-object
   * discovery uses to read a component's name from source without running it.
   * An agent given this action as a tool tells the model this text verbatim.
   */
  describe?: string
}

export interface ProjectScan {
  dir: string
  config: MorganaConfig
  configFile: string | null
  actions: SdkActionMeta[]
  /** Action dirs actually found. */
  actionDirs: string[]
  warnings: string[]
}

const IGNORE_DIRS = new Set(['node_modules', '.morgana', 'dist', '.git', '.next', '.turbo'])

export function resolveActionDirs(dir: string, explicit?: string[]): string[] {
  if (explicit?.length) return explicit.map((d) => path.resolve(dir, d))
  const candidates = [path.join(dir, 'src', 'actions'), path.join(dir, 'actions')]
  return candidates.filter((d) => fs.existsSync(d) && fs.statSync(d).isDirectory())
}

function collectTsFiles(dir: string, into: string[]): void {
  let items: fs.Dirent[]
  try {
    items = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const item of items) {
    const full = path.join(dir, item.name)
    if (item.isDirectory()) {
      if (!IGNORE_DIRS.has(item.name)) collectTsFiles(full, into)
    } else if (
      item.isFile() &&
      (item.name.endsWith('.ts') || item.name.endsWith('.tsx')) &&
      !item.name.endsWith('.d.ts') &&
      !item.name.endsWith('.test.ts') &&
      item.name !== 'index.ts'
    ) {
      into.push(full)
    }
  }
}

/** Evaluate a side-effect-free literal node (string | number | boolean | array | plain object). */
function evalLiteral(node: ts.Node): { ok: boolean; value?: unknown } {
  if (ts.isStringLiteralLike(node)) return { ok: true, value: node.text }
  if (ts.isNumericLiteral(node)) return { ok: true, value: Number(node.text) }
  if (node.kind === ts.SyntaxKind.TrueKeyword) return { ok: true, value: true }
  if (node.kind === ts.SyntaxKind.FalseKeyword) return { ok: true, value: false }
  if (node.kind === ts.SyntaxKind.NullKeyword) return { ok: true, value: null }
  if (ts.isArrayLiteralExpression(node)) {
    const out: unknown[] = []
    for (const el of node.elements) {
      const r = evalLiteral(el)
      if (!r.ok) return { ok: false }
      out.push(r.value)
    }
    return { ok: true, value: out }
  }
  if (ts.isObjectLiteralExpression(node)) {
    const out: Record<string, unknown> = {}
    for (const prop of node.properties) {
      if (!ts.isPropertyAssignment(prop)) return { ok: false }
      const key = prop.name.getText().replace(/^['"]|['"]$/g, '')
      const r = evalLiteral(prop.initializer)
      if (!r.ok) return { ok: false }
      out[key] = r.value
    }
    return { ok: true, value: out }
  }
  if (ts.isIdentifier(node) && node.text === 'undefined') return { ok: true, value: undefined }
  return { ok: false }
}

function propOf(obj: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined {
  for (const p of obj.properties) {
    if (ts.isPropertyAssignment(p) && p.name.getText().replace(/^['"]|['"]$/g, '') === name) {
      return p.initializer
    }
    if (ts.isShorthandPropertyAssignment(p) && p.name.text === name) return undefined
  }
  return undefined
}

interface FactoryFound {
  kind: 'server' | 'client'
  configNode?: ts.ObjectLiteralExpression
  handlerNode: ts.Node
  handlerSrc: string
  handlerAsync: boolean
}

/**
 * The JSDoc block directly above a statement, as plain text.
 *
 * `ts.getJSDocCommentsAndTags` is the wrong tool: it returns parsed tags, and what
 * a tool needs is the prose. The leading comment ranges are read directly, and
 * only the *first* paragraph is kept — a model is told what a tool does, not how
 * its author reasoned about it.
 *
 * Returns undefined when there is no JSDoc, so "no description" stays
 * distinguishable from an empty one.
 */
function readJsDoc(st: ts.Statement): string | undefined {
  const ranges = ts.getLeadingCommentRanges(st.getSourceFile().text, st.getFullStart()) ?? [];
  for (const range of ranges) {
    const raw = st.getSourceFile().text.slice(range.pos, range.end);
    if (!raw.startsWith('/**')) continue;
    const body = raw
      .replace(/^\/\*\*/, '')
      .replace(/\*\/$/, '')
      .split('\n')
      .map((line) => line.replace(/^\s*\*\s?/, '').trim())
      .join('\n')
      .trim();
    if (!body) continue;
    // First paragraph only: stop at the first blank line. Everything after it is
    // explanation, and explanation is not a tool description.
    const first = body.split(/\n\s*\n/)[0]?.replace(/\s+/g, ' ').trim();
    if (first) return first;
  }
  return undefined;
}

function handlerInfo(node: ts.Node, sf: ts.SourceFile): { src: string; async: boolean } {
  const src = node.getText(sf)
  const isAsync =
    (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)) &&
    node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) === true
  return { src, async: isAsync }
}

/**
 * Find every `defineServerAction({...})` / `defineClientAction({...})` bound to
 * an exported const, in declaration order.
 *
 * A file may declare more than one. Returning only the first silently dropped
 * the rest, so a multi-action file produced one output and no warning — the
 * worst failure mode a compiler has.
 */
function findFactories(sf: ts.SourceFile): Array<{ name: string; found: FactoryFound }> {
  const out: Array<{ name: string; found: FactoryFound }> = []
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue
    const isExported = st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) === true
    if (!isExported) continue
    for (const decl of st.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || !decl.initializer) continue
      const init = decl.initializer
      if (!ts.isCallExpression(init) || !ts.isIdentifier(init.expression)) continue
      const callee = init.expression.text
      if (callee !== 'defineServerAction' && callee !== 'defineClientAction') continue
      const arg = init.arguments[0]
      if (!arg || !ts.isObjectLiteralExpression(arg)) continue
      const kind = callee === 'defineServerAction' ? 'server' : 'client'
      const configRaw = propOf(arg, 'config')
      const configNode =
        configRaw && ts.isObjectLiteralExpression(configRaw) ? configRaw : undefined
      const handlerNode = propOf(arg, 'handler')
      if (!handlerNode) continue
      const { src, async } = handlerInfo(handlerNode, sf)
      out.push({
        name: decl.name.text,
        found: { kind, configNode, handlerNode, handlerSrc: src, handlerAsync: async },
      })
    }
  }
  return out
}

function findPlainHandler(sf: ts.SourceFile): { kind: 'plain-handle' | 'plain-run'; src: string; async: boolean } | null {
  for (const st of sf.statements) {
    const isExported =
      ts.canHaveModifiers(st) && ts.getModifiers(st)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) === true
    if (!isExported) continue
    if (ts.isFunctionDeclaration(st) && st.name && (st.name.text === 'handle' || st.name.text === 'run')) {
      const { src, async } = handlerInfo(st, sf)
      return { kind: st.name.text === 'handle' ? 'plain-handle' : 'plain-run', src, async }
    }
    if (ts.isVariableStatement(st)) {
      for (const decl of st.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || !decl.initializer) continue
        if (decl.name.text !== 'handle' && decl.name.text !== 'run') continue
        const { src, async } = handlerInfo(decl.initializer, sf)
        return { kind: decl.name.text === 'handle' ? 'plain-handle' : 'plain-run', src, async }
      }
    }
  }
  return null
}

function extractContract(sf: ts.SourceFile, checker: ts.TypeChecker): { input?: string; output?: string } | undefined {
  let symbol: ts.Symbol | undefined
  for (const st of sf.statements) {
    const isExported =
      ts.canHaveModifiers(st) && ts.getModifiers(st)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) === true
    if (!isExported) continue
    if (ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st)) {
      if (st.name.text === 'Contract') {
        symbol = checker.getSymbolAtLocation(st.name)
        break
      }
    }
  }
  if (!symbol) return undefined
  const t = checker.getDeclaredTypeOfSymbol(symbol)
  const out: { input?: string; output?: string } = {}
  for (const key of ['input', 'output'] as const) {
    const prop = t.getProperty(key)
    if (!prop) continue
    const pt = checker.getTypeOfSymbolAtLocation(prop, sf)
    out[key] = checker.typeToString(pt, undefined, ts.TypeFormatFlags.NoTruncation).replace(/\s*\r?\n\s*/g, ' ').trim()
  }
  return out
}

function laneOfFile(file: string, factoryKind: 'server' | 'client' | null): ActionLane {
  const parts = file.split(/[\\/]/)
  if (parts.includes('compile')) return 'compile'
  if (factoryKind === 'client') return 'client'
  if (factoryKind === 'server') return 'server'
  // A plain handler has no factory to say which lane it is, so the directory
  // decides. `browser` is still read so an existing project's folder keeps
  // working after the rename to `client`.
  if (parts.includes('client') || parts.includes('browser')) return 'client'
  if (parts.includes('server')) return 'server'
  return 'server'
}

function normOn(on: unknown): string[] {
  if (typeof on === 'string') return [on]
  if (Array.isArray(on)) return on.filter((v): v is string => typeof v === 'string')
  return []
}

function parseFactoryConfig(node: ts.ObjectLiteralExpression | undefined): Partial<SdkActionMeta> {
  if (!node) return {}
  const out: Partial<SdkActionMeta> = {}
  const onRaw = propOf(node, 'on')
  if (onRaw) {
    const r = evalLiteral(onRaw)
    if (r.ok) out.on = normOn(r.value)
  }
  const whenRaw = propOf(node, 'when')
  if (whenRaw && ts.isObjectLiteralExpression(whenRaw)) {
    const r = evalLiteral(whenRaw)
    if (r.ok && typeof r.value === 'object') out.when = r.value as Record<string, unknown>
  }
  const authRaw = propOf(node, 'auth')
  if (authRaw && ts.isStringLiteralLike(authRaw) && (authRaw.text === 'public' || authRaw.text === 'member')) {
    out.auth = authRaw.text
  }
  const corsRaw = propOf(node, 'cors')
  if (corsRaw) {
    const r = evalLiteral(corsRaw)
    if (r.ok) out.cors = r.value
  }
  const enabledRaw = propOf(node, 'enabled')
  if (enabledRaw) {
    const r = evalLiteral(enabledRaw)
    if (r.ok && typeof r.value === 'boolean') out.enabled = r.value
  }
  const debounceRaw = propOf(node, 'debounce')
  if (debounceRaw && ts.isNumericLiteral(debounceRaw)) out.debounce = Number(debounceRaw.text)
  const throttleRaw = propOf(node, 'throttle')
  if (throttleRaw && ts.isNumericLiteral(throttleRaw)) out.throttle = Number(throttleRaw.text)
  return out
}

/** Parse morgana.config.ts statically (defineConfig identity — read the literal). */
export function parseProjectConfig(configFile: string): { config: MorganaConfig; warnings: string[] } {
  const warnings: string[] = []
  const fallback: MorganaConfig = {}
  let text: string
  try {
    text = fs.readFileSync(configFile, 'utf8')
  } catch {
    return { config: fallback, warnings: [`config file not readable: ${configFile}`] }
  }
  const sf = ts.createSourceFile(configFile, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
  for (const st of sf.statements) {
    const call = ts.isVariableStatement(st)
      ? st.declarationList.declarations.find((d) => d.initializer && ts.isCallExpression(d.initializer))?.initializer as ts.CallExpression | undefined
      : ts.isExpressionStatement(st) && ts.isCallExpression(st.expression)
        ? st.expression
        : undefined
    if (!call || !ts.isIdentifier(call.expression) || call.expression.text !== 'defineConfig') continue
    const arg = call.arguments[0]
    if (!arg || !ts.isObjectLiteralExpression(arg)) continue
    const r = evalLiteral(arg)
    if (r.ok && typeof r.value === 'object' && r.value !== null) {
      return { config: r.value as MorganaConfig, warnings }
    }
    warnings.push('morgana.config.ts is not a static literal — using empty config')
    return { config: fallback, warnings }
  }
  // Also accept `export default {...}` / `export default defineConfig({...})`.
  for (const st of sf.statements) {
    if (ts.isExportAssignment(st)) {
      if (ts.isObjectLiteralExpression(st.expression)) {
        const r = evalLiteral(st.expression)
        if (r.ok && typeof r.value === 'object') return { config: r.value as MorganaConfig, warnings }
      }
      if (ts.isCallExpression(st.expression) && ts.isIdentifier(st.expression.expression) && st.expression.expression.text === 'defineConfig') {
        const arg = st.expression.arguments[0]
        if (arg && ts.isObjectLiteralExpression(arg)) {
          const r = evalLiteral(arg)
          if (r.ok && typeof r.value === 'object' && r.value !== null) {
            return { config: r.value as MorganaConfig, warnings }
          }
          warnings.push('morgana.config.ts is not a static literal — using empty config')
          return { config: fallback, warnings }
        }
      }
    }
  }
  warnings.push('no defineConfig/default export found — using empty config')
  return { config: fallback, warnings }
}

export function hookRunsFor(hooks: Hook[] | undefined, actionName: string): Hook[] {
  if (!hooks) return []
  return hooks.filter((h) => {
    const run = Array.isArray(h.run) ? h.run : [h.run]
    return run.includes(actionName) && h.enabled !== false
  })
}

export function scanProject(opts: { dir: string; actionsDirs?: string[] }): ProjectScan {
  const { dir } = opts
  const warnings: string[] = []
  const configCandidates = [path.join(dir, 'morgana.config.ts'), path.join(dir, 'morgana.config.mts')]
  const configFile = configCandidates.find((f) => fs.existsSync(f)) ?? null
  const config = configFile ? parseProjectConfig(configFile).config : {}
  if (configFile) warnings.push(...parseProjectConfig(configFile).warnings.filter((w) => !w.startsWith('config file')))

  const actionDirs = resolveActionDirs(dir, opts.actionsDirs)
  const files: string[] = []
  for (const d of actionDirs) collectTsFiles(d, files)

  const actions: SdkActionMeta[] = []
  const seen = new Map<string, string>()

  let checker: ts.TypeChecker | null = null
  let program: ts.Program | null = null
  if (files.length) {
    try {
      program = ts.createProgram(files, {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        types: [],
      })
      checker = program.getTypeChecker()
    } catch {
      checker = null
    }
  }

  for (const file of files) {
    const fallbackName = path.basename(file).replace(/\.tsx?$/, '')
    const text = fs.readFileSync(file, 'utf8')
    const sf = program?.getSourceFile(file) ?? ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true)
    const factories = findFactories(sf)
    const plain = factories.length ? null : findPlainHandler(sf)
    if (!factories.length && !plain) {
      warnings.push(`skipping ${path.relative(dir, file)}: no exported defineServerAction/defineClientAction/handle/run`)
      continue
    }

    const contract = checker ? extractContract(sf, checker) : undefined
    for (const factory of factories) {
      const name = factory.name || fallbackName
      if (seen.has(name)) {
        throw new Error(`Duplicate action name "${name}" — ${file} collides with ${seen.get(name)}`)
      }
      seen.set(name, file)
      const cfg = parseFactoryConfig(factory.found.configNode)
      const lane: ActionLane = cfg.on?.includes('compile') ? 'compile' : laneOfFile(file, factory.found.kind)
      actions.push({
        name,
        file,
        lane,
        factory: factory.found.kind,
        on: cfg.on ?? [],
        when: cfg.when,
        auth: cfg.auth,
        cors: cfg.cors,
        enabled: cfg.enabled ?? true,
        debounce: cfg.debounce,
        throttle: cfg.throttle,
        handlerSrc: factory.found.handlerSrc,
        handlerAsync: factory.found.handlerAsync,
        contract,
      })
    }

    if (plain) {
      const name = fallbackName
      if (seen.has(name)) {
        throw new Error(`Duplicate action name "${name}" — ${file} collides with ${seen.get(name)}`)
      }
      seen.set(name, file)
      actions.push({
        name,
        file,
        lane: laneOfFile(file, null) === 'client' ? 'client' : 'server',
        factory: plain.kind,
        on: [],
        enabled: true,
        handlerSrc: plain.src,
        handlerAsync: plain.async,
        contract,
      })
    }
  }

  // Compile markers from hooks: hooks with on:compile that run an action
  // promote that action into the compile lane even without action-level config.
  const hooks = config.hooks ?? []
  for (const a of actions) {
    if (a.lane === 'compile') continue
    const viaHookCompile = hookRunsFor(hooks, a.name).some((h) => {
      const on = Array.isArray(h.on) ? h.on : [h.on]
      return on.includes('compile')
    })
    if (viaHookCompile) a.lane = 'compile'
  }

  actions.sort((a, b) => a.name.localeCompare(b.name))
  return { dir, config, configFile, actions, actionDirs, warnings }
}
