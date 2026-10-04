/**
 * The registry generator — the frontend/backend type bridge (FRAMEWORK.md §6).
 *
 * Statically reads each action file's exported `Contract` type (via the TS
 * compiler — no runtime import, no execution) and emits
 * `.morgana/types/registry.d.ts`, whose `ActionsRegistry` / `AppEvents`
 * entries merge into the globals declared in `contracts.ts`. The SDK's
 * `ctx.actions.run` / `ctx.emit` are keyed on those globals, so emission
 * alone makes every call site contract-typed.
 *
 * Actions without a `Contract` export are simply omitted from the file —
 * they fall through the global fallback index signatures as
 * `ActionContract<unknown, unknown>` and keep working everywhere.
 *
 * Limitation (by design, matches FRAMEWORK §6 examples): contract members
 * are emitted as structural inline types. A contract that references a
 * named type (e.g. `CartItem`) emits that name unqualified — keep contracts
 * self-contained, or re-export the referenced types for the generated file.
 */

import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

export interface RegistryEntry {
  /** Action name — the file base name (`chatUI.ts` → `chatUI`). */
  name: string
  /** Absolute path of the source action file. */
  file: string
  /** Lane inferred from the directory the action lives in. */
  lane: 'server' | 'client' | 'compile' | 'action'
}

export interface GeneratedRegistry {
  /** Where the d.ts was written (null when nothing was written). */
  outPath: string | null
  /** Actions with a usable Contract — emitted into the registry. */
  entries: RegistryEntry[]
  /** Actions scanned but without a (usable) Contract export. */
  untyped: string[]
  /** Number of .ts action files scanned. */
  scanned: number
  /** The emitted declaration file text. */
  dts: string
}

export interface GenerateRegistryOptions {
  /** Project directory (the one holding `.morgana/`, `src/actions/`, …). */
  dir: string
  /** Output directory (default: `<dir>/.morgana/types`). */
  outDir?: string
  /** Explicit action directories (absolute or relative to `dir`). Overrides discovery. */
  actionsDirs?: string[]
}

const IGNORE = new Set(['node_modules', '.morgana', 'dist', '.git'])

/** Discover the action directories of a project, in convention order. */
export function resolveActionsDirs(opts: GenerateRegistryOptions): string[] {
  if (opts.actionsDirs?.length) {
    return opts.actionsDirs.map((d) => path.resolve(opts.dir, d))
  }
  const candidates = [path.join(opts.dir, 'src', 'actions'), path.join(opts.dir, 'actions')]
  return candidates.filter((d) => fs.existsSync(d))
}

function collectFiles(dir: string, into: string[]): void {
  let items: fs.Dirent[]
  try {
    items = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const item of items) {
    const full = path.join(dir, item.name)
    if (item.isDirectory()) {
      if (!IGNORE.has(item.name)) collectFiles(full, into)
    } else if (
      item.isFile() &&
      item.name.endsWith('.ts') &&
      !item.name.endsWith('.d.ts') &&
      !item.name.endsWith('.test.ts') &&
      item.name !== 'index.ts'
    ) {
      into.push(full)
    }
  }
}

function laneOf(file: string): RegistryEntry['lane'] {
  const parts = file.split(/[\\/]/)
  if (parts.includes('compile')) return 'compile'
  // The page lane is a directory named `client`, matching `defineClientAction`.
  // `browser` is still accepted so an existing project's folder keeps working —
  // the directory is a convention this reads, not a contract it enforces.
  if (parts.includes('client') || parts.includes('browser')) return 'client'
  if (parts.includes('server')) return 'server'
  return 'action'
}

/** True when the statement carries an `export` modifier. */
function isExported(st: ts.Statement): boolean {
  return ts.canHaveModifiers(st) && ts.getModifiers(st)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) === true
}

interface Extracted {
  input?: string
  output?: string
}

/**
 * Statically extract the `input` / `output` member types of a file's exported
 * `Contract` (interface or type alias). Returns undefined when the file has no
 * usable Contract export.
 */
function extractContract(sf: ts.SourceFile, checker: ts.TypeChecker): Extracted | undefined {
  let symbol: ts.Symbol | undefined
  for (const st of sf.statements) {
    if (!isExported(st)) continue
    if (ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st)) {
      if (st.name.text === 'Contract') {
        symbol = checker.getSymbolAtLocation(st.name)
        break
      }
    }
  }
  if (!symbol) return undefined

  const contractType = checker.getDeclaredTypeOfSymbol(symbol)
  const out: Extracted = {}
  for (const key of ['input', 'output'] as const) {
    const prop = contractType.getProperty(key)
    if (!prop) continue
    const propType = checker.getTypeOfSymbolAtLocation(prop, sf)
    const text = checker.typeToString(propType, undefined, ts.TypeFormatFlags.NoTruncation)
    // Normalize whitespace from multi-line formatting — one entry per line.
    out[key] = text.replace(/\s*\r?\n\s*/g, ' ').trim()
  }
  return out
}


/** Render the registry declaration file for the given entries. */
export function renderRegistryDts(entries: RegistryEntry[], bodies: Map<string, Extracted>): string {
  const lines: string[] = [
    '/**',
    ' * Generated by `morgana types` / `morgana dev` — do not edit.',
    ' * Source of truth: the exported `Contract` type in each action file.',
    ' * Untyped actions fall through the global index signatures to',
    ' * ActionContract<unknown, unknown> — they keep working everywhere.',
    ' */',
    "import type { ActionContract } from '@morgana/sdk'",
    '',
    'declare global {',
    '  interface ActionsRegistry {',
  ]
  for (const e of entries) {
    const b = bodies.get(e.name)
    lines.push(`    ${e.name}: ActionContract<${b?.input ?? 'unknown'}, ${b?.output ?? 'unknown'}>`)
  }
  lines.push('  }', '  interface AppEvents {}', '}', '', 'export {}', '')
  return lines.join('\n')
}

/** Generate `.morgana/types/registry.d.ts` for a project. Idempotent. */
export function generateRegistry(opts: GenerateRegistryOptions): GeneratedRegistry {
  const dirs = resolveActionsDirs(opts)
  const files: string[] = []
  for (const d of dirs) collectFiles(d, files)

  const untyped: string[] = []
  const entries: RegistryEntry[] = []
  const bodies = new Map<string, Extracted>()

  if (files.length) {
    const program = ts.createProgram(files, {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      noEmit: true,
      skipLibCheck: true,
    })
    const checker = program.getTypeChecker()

    for (const file of files) {
      const name = path.basename(file, '.ts')
      const sf = program.getSourceFile(file)
      if (!sf) {
        untyped.push(name)
        continue
      }
      const contract = extractContract(sf, checker)
      if (!contract || (!contract.input && !contract.output)) {
        untyped.push(name)
        continue
      }
      if (entries.some((e) => e.name === name)) {
        const clash = entries.find((e) => e.name === name)
        throw new Error(`Duplicate action name "${name}" — ${file} collides with ${clash?.file}`)
      }
      entries.push({ name, file, lane: laneOf(file) })
      bodies.set(name, contract)
    }
  }

  entries.sort((a, b) => a.name.localeCompare(b.name))
  const dts = renderRegistryDts(entries, bodies)

  const outDir = path.resolve(opts.dir, opts.outDir ?? path.join('.morgana', 'types'))
  const outPath = path.join(outDir, 'registry.d.ts')
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(outPath, dts, 'utf8')

  return { outPath, entries, untyped, scanned: files.length, dts }
}

/**
 * Regenerate the registry whenever an action file changes (dev watch mode).
 * Returns a dispose function. Uses recursive fs.watch where available
 * (Windows/macOS); on failure it silently no-ops — generation is additive.
 */
export function watchRegistry(
  opts: GenerateRegistryOptions,
  onChange?: (result: GeneratedRegistry) => void,
): () => void {
  const dirs = resolveActionsDirs(opts)
  const watchers: fs.FSWatcher[] = []
  let timer: ReturnType<typeof setTimeout> | undefined

  const regen = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      try {
        onChange?.(generateRegistry(opts))
      } catch {
        /* a half-saved file must never take dev down — next change retries */
      }
    }, 300)
  }

  for (const d of dirs) {
    try {
      watchers.push(fs.watch(d, { recursive: true }, regen))
    } catch {
      /* recursive watch unsupported here — pre-deploy `morgana types` still covers it */
    }
  }
  return () => {
    clearTimeout(timer)
    for (const w of watchers) w.close()
  }
}
