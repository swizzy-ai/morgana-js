/**
 * The channel access action — one per project, generated from whatever
 * `ctx.channels.create(name, { permissions })` captured.
 *
 * Why it is an *action* rather than a string evaluated by the worker: an action
 * already receives an ordinary action context. `ctx.auth.user` is the person
 * subscribing, `ctx.server.collections` queries a store, and everything else the
 * framework can do is already there. So the permission question becomes ordinary
 * action code, with no new evaluation surface and no string-eval in the worker.
 *
 * One module for every channel rather than one per channel, because they share
 * an import, a deploy and a cache entry — and the channel arrives in
 * `ctx.args.channel`, which the subscription path already sends.
 *
 * ## The one constraint this imposes
 *
 * A permission function is captured with `Function.prototype.toString()`, so it
 * keeps its *body* and loses its *closure*. A function that reads a module-level
 * binding is serialised as a function that references a name nothing defines,
 * and it throws when the room is opened.
 *
 * That is a real limitation rather than a sharp edge, so it is made loud: a
 * captured function is checked for bare identifiers that are neither a parameter
 * nor a known global, and a build warning names the channel. Silently shipping a
 * private room nobody can enter — or, worse, one whose check always throws and is
 * then read as "not permitted" — is the failure mode worth avoiding.
 */
import ts from 'typescript'
import type { ChannelDecl } from './ir'

/** The action every permission function is emitted into. */
export const ACCESS_ACTION = '__channel_access'

/**
 * Identifiers a captured function refers to but cannot reach.
 *
 * Resolved with the TypeScript checker rather than by pattern-matching the
 * source. The first attempt scanned for bare words and reported `async`, `const`,
 * `if` and `return` — keywords — along with every object key in the body. That
 * is worse than no check at all: a warning that fires on every permission
 * function teaches people to ignore warnings, and then the one that mattered is
 * the one they scroll past.
 *
 * So the function is wrapped in a module, given a real `ts.Program`, and every
 * identifier is resolved through the checker. What survives is genuinely unbound:
 * a closure over something the module it was written in declared.
 */
function unboundIdentifiers(source: string): string[] {
  // Wrapped so the function body is a module body, with `ctx` as the only
  // parameter — which is the shape the generated action actually calls it with.
  const virtual = [
    'async function __morganaPermission(ctx) {',
    `  return (${source});`,
    '}',
  ].join('\n')

  const fileName = '/__morgana_permission.ts'
  const host: ts.CompilerHost = {
    getSourceFile: (name) =>
      name === fileName
        ? ts.createSourceFile(name, virtual, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
        : undefined,
    writeFile: () => {},
    getDefaultLibFileName: () => '/lib.d.ts',
    useCaseSensitiveFileNames: () => true,
    getCanonicalFileName: (n) => n,
    getCurrentDirectory: () => '/',
    getNewLine: () => '\n',
    fileExists: (name) => name === fileName,
    readFile: (name) => (name === fileName ? virtual : undefined),
    directoryExists: () => true,
    getDirectories: () => [],
    getDefaultLibLocation: () => '/',
  }

  let program: ts.Program
  try {
    program = ts.createProgram([fileName], { noLib: true, noResolve: true }, host)
  } catch {
    // A parse failure must not fail the build over a warning. The runtime is
    // fail-closed, so an unanalysable function is still safe — just later.
    return []
  }
  const checker = program.getTypeChecker()
  const sf = program.getSourceFile(fileName)
  if (!sf) return []

  const unbound = new Set<string>()
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) {
      const sym = checker.getSymbolAtLocation(node)
      const decls = sym?.declarations ?? []
      // No declarations at all means the name resolved to nothing in this file
      // — either an undeclared global or a closure over a name the generated
      // action will not have. Both are worth reporting.
      if (decls.length === 0) {
        const parent = node.parent
        // A property key is not a reference: `{ ok: true }` does not read `ok`.
        const isPropertyKey =
          (ts.isPropertyAssignment(parent) && parent.name === node) ||
          (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
          (ts.isPropertySignature(parent) && parent.name === node)
        if (!isPropertyKey) unbound.add(node.text)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)

  return [...unbound].filter((name) => !SANDBOX_GLOBALS.has(name)).sort()
}

/**
 * Globals the QuickJS sandbox provides, which the checker cannot see because it
 * runs with `noLib`.
 *
 * Without `lib.d.ts` every one of these resolves to nothing, so without this
 * list a perfectly valid check written as `(ctx) => Boolean(ctx.auth.user)`
 * would warn about `Boolean`. That is the whole false-positive budget spent on
 * one identifier, and a warning that fires on ordinary code is worse than none.
 */
const SANDBOX_GLOBALS = new Set([
  'globalThis',
  'console',
  'undefined',
  'NaN',
  'Infinity',
  'Object',
  'Array',
  'String',
  'Number',
  'Boolean',
  'Symbol',
  'BigInt',
  'Math',
  'JSON',
  'Date',
  'RegExp',
  'Error',
  'TypeError',
  'RangeError',
  'Promise',
  'Map',
  'Set',
  'WeakMap',
  'WeakSet',
  'Proxy',
  'Reflect',
  'ArrayBuffer',
  'Uint8Array',
  'TextEncoder',
  'TextDecoder',
  'structuredClone',
  'fetch',
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'queueMicrotask',
])

/**
 * Build the access action from the captured permission functions.
 *
 * Returns `null` when no channel declared one — the common case, and emitting an
 * action that always answers "open" would be an artefact in every project that
 * does not use the feature.
 */
export function emitAccessModule(
  channels: Map<string, ChannelDecl>,
): { name: string; code: string } | null {
  const withFn = [...channels.values()].filter((c) => typeof c.__src === 'string' && c.__src)
  if (!withFn.length) return null

  // The captured source is already a complete function expression — `toString()`
  // of an arrow function includes its own parentheses — so it is used verbatim
  // rather than wrapped again.
  const entries = withFn
    .map((c) => `  ${JSON.stringify(c.name)}: ${c.__src}`)
    .join(',\n')

  return {
    name: ACCESS_ACTION,
    code: [
      '// Generated by @morgana/sdk-compile — do not edit.',
      '//',
      '// One entry per channel that declared a permission function with',
      '// `ctx.channels.create(name, { permissions })`. The subscription path invokes this',
      '// action with the channel in `ctx.args.channel` and the caller’s own token,',
      '// so `ctx.auth.user` here is the person subscribing.',
      '//',
      '// The answer must be `{ ok: boolean, reason?: string }`. Anything else is a',
      '// failure and is treated as "not granted" — the room does not open itself',
      '// because its own check broke.',
      'const __rules = {',
      entries,
      '};',
      'async function handle(ctx) {',
      '  const name = ctx.args && ctx.args.channel;',
      '  const rule = Object.prototype.hasOwnProperty.call(__rules, name) ? __rules[name] : undefined;',
      '  if (!rule) {',
      '    // No rule for this channel is a refusal, not an allow. A request naming a',
      '    // channel this build knows nothing about must not fall through to open.',
      '    return { ok: false, reason: "no access rule is configured for channel \'" + name + "\'" };',
      '  }',
      '  const verdict = await rule(ctx);',
      '  if (verdict && typeof verdict === "object" && typeof verdict.ok === "boolean") return verdict;',
      '  // A bare boolean is accepted, because it is what a check like',
      '  // `(ctx) => ctx.auth.user != null` naturally returns.',
      '  if (typeof verdict === "boolean") return { ok: verdict };',
      '  return { ok: false, reason: "the access rule for \'" + name + "\' returned " + typeof verdict + ", expected { ok: boolean }" };',
      '}',
      'export default handle;',
      '',
    ].join('\n'),
  }
}

/** Build-time warnings for captured functions that reference more than they can reach. */
export function accessModuleWarnings(channels: Map<string, ChannelDecl>): string[] {
  const out: string[] = []
  for (const c of channels.values()) {
    if (typeof c.__src !== 'string' || !c.__src) continue
    const unbound = unboundIdentifiers(c.__src)
    if (unbound.length) {
      out.push(
        `channel "${c.name}": its permission function references ${unbound
          .map((u) => `"${u}"`)
          .join(', ')}, which is not available inside the generated access action — ` +
          'a permission function is captured by source, so it must not read anything ' +
          'from the module it was written in. Pass the value through ctx.args instead.',
      )
    }
  }
  return out
}