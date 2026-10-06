/**
 * Server-object discovery — finds `customServerObject({...})` definitions
 * without executing them.
 *
 * A server object lives in `src/server-objects/*.ts`, one per file, either as
 * a default export or as an exported const:
 *
 *   export default customServerObject({ name: 'sheet', ops: { ... } })
 *   export const sheet = customServerObject({ name: 'sheet', ops: { ... } })
 *
 * The compiler searches for the `customServerObject` identifier (the same way
 * action discovery searches `defineServerAction`), then reads the literal
 * statically with the TS compiler: `name` must be a string literal, `shape` /
 * `links` / `computed` must be side-effect-free literals, `ops` keys are the
 * op names. A build must not run third-party code just to learn a name, and a
 * file claiming two objects is a build error naming both.
 */
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

export interface DiscoveredServerObject {
  /** Object type name — the `name` literal. */
  name: string
  /** Absolute path of the defining file. */
  file: string
  /** 'default' for `export default …`, else the exported const name. */
  exportName: string
  shape: unknown
  links: unknown
  computed: unknown
  /** Op names — the keys of the `ops` object literal. */
  ops: string[]
}

/** Directories scanned for server objects, in priority order. */
export function serverObjectDirs(dir: string, explicit?: string[]): string[] {
  if (explicit?.length) return explicit.map((d) => path.resolve(dir, d))
  const candidates = [path.join(dir, 'src', 'server-objects'), path.join(dir, 'server-objects')]
  return candidates.filter((d) => {
    try {
      return fs.statSync(d).isDirectory()
    } catch {
      return false
    }
  })
}

function listModuleFiles(root: string): string[] {
  const out: string[] = []
  const walk = (d: string): void => {
    let items: fs.Dirent[]
    try {
      items = fs.readdirSync(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const item of items) {
      if (item.name.startsWith('.')) continue
      const full = path.join(d, item.name)
      if (item.isDirectory()) {
        if (item.name === 'node_modules') continue
        walk(full)
      } else if (
        /\.(ts|tsx|mts|js|mjs)$/.test(item.name) &&
        !/\.d\.ts$/.test(item.name) &&
        !/\.test\.[cm]?[jt]sx?$/.test(item.name)
      ) {
        out.push(full)
      }
    }
  }
  walk(root)
  return out.sort()
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
      const key = prop.name.getText()
      const r = evalLiteral(prop.initializer)
      if (!r.ok) return { ok: false }
      out[key.replace(/^['"]|['"]$/g, '')] = r.value
    }
    return { ok: true, value: out }
  }
  return { ok: false }
}

function propOf(obj: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined {
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue
    if (prop.name.getText().replace(/^['"]|['"]$/g, '') === name) return prop.initializer
  }
  return undefined
}

function isCustomServerObjectCall(node: ts.Node): node is ts.CallExpression {
  return ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'customServerObject'
}

/** Every `customServerObject({...})` in the file, in declaration order. */
function findDefinitions(sf: ts.SourceFile): Array<{ exportName: string; arg: ts.ObjectLiteralExpression }> {
  const out: Array<{ exportName: string; arg: ts.ObjectLiteralExpression }> = []
  for (const st of sf.statements) {
    // Default exports carry no modifiers, so this branch runs before the
    // exported-statement gate below — otherwise `export default …` is skipped.
    if (ts.isExportAssignment(st) && !st.isExportEquals && isCustomServerObjectCall(st.expression)) {
      const arg = st.expression.arguments[0]
      if (arg && ts.isObjectLiteralExpression(arg)) out.push({ exportName: 'default', arg })
      continue
    }
    const isExported =
      ts.canHaveModifiers(st) && ts.getModifiers(st)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) === true
    if (!isExported) continue
    if (ts.isVariableStatement(st)) {
      for (const decl of st.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || !decl.initializer) continue
        if (!isCustomServerObjectCall(decl.initializer)) continue
        const arg = decl.initializer.arguments[0]
        if (arg && ts.isObjectLiteralExpression(arg)) out.push({ exportName: decl.name.text, arg })
      }
    }
  }
  return out
}

function readDefinition(file: string, exportName: string, arg: ts.ObjectLiteralExpression, dir: string): DiscoveredServerObject {
  const rel = path.relative(dir, file)
  const nameRaw = propOf(arg, 'name')
  if (!nameRaw || !ts.isStringLiteralLike(nameRaw) || !nameRaw.text) {
    throw new Error(
      `server object in ${rel} has no \`name: '…'\` string literal — a type without a name cannot deploy`,
    )
  }
  const readValue = (key: string): unknown => {
    const raw = propOf(arg, key)
    if (!raw) return undefined
    const r = evalLiteral(raw)
    return r.ok ? r.value : undefined
  }
  const opsRaw = propOf(arg, 'ops')
  if (!opsRaw || !ts.isObjectLiteralExpression(opsRaw)) {
    throw new Error(`server object "${nameRaw.text}" in ${rel} has no \`ops: { … }\` object literal`)
  }
  const ops: string[] = []
  for (const prop of opsRaw.properties) {
    if (ts.isPropertyAssignment(prop) || ts.isMethodDeclaration(prop) || ts.isShorthandPropertyAssignment(prop)) {
      ops.push(prop.name.getText().replace(/^['"]|['"]$/g, ''))
    }
  }
  if (!ops.length) {
    throw new Error(`server object "${nameRaw.text}" in ${rel} declares no ops — an object with no methods cannot run`)
  }
  return {
    name: nameRaw.text,
    file,
    exportName,
    shape: readValue('shape') ?? { columns: [] },
    links: readValue('links') ?? {},
    computed: readValue('computed') ?? {},
    ops,
  }
}

/**
 * Discover every server-object definition under the project dirs. Reads from
 * source only — never executes project code. Name collisions across files are
 * a build error listing both files.
 */
export function discoverServerObjects(dir: string, warnings: string[] = [], explicit?: string[]): DiscoveredServerObject[] {
  const out: DiscoveredServerObject[] = []
  const seen = new Map<string, string>()
  for (const root of serverObjectDirs(dir, explicit)) {
    for (const file of listModuleFiles(root)) {
      let text: string
      try {
        text = fs.readFileSync(file, 'utf8')
      } catch {
        continue
      }
      const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
      const found = findDefinitions(sf)
      if (!found.length) {
        warnings.push(`${path.relative(dir, file)} is in server-objects/ but exports no customServerObject(…) — ignored`)
        continue
      }
      if (found.length > 1) {
        throw new Error(
          `${path.relative(dir, file)} defines ${found.length} server objects — one object per file, split it up`,
        )
      }
      const decl = readDefinition(file, found[0]!.exportName, found[0]!.arg, dir)
      const prev = seen.get(decl.name)
      if (prev) {
        throw new Error(
          `two server objects both claim the name "${decl.name}": ${path.relative(dir, prev)} and ${path.relative(dir, file)}`,
        )
      }
      seen.set(decl.name, file)
      out.push(decl)
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}
