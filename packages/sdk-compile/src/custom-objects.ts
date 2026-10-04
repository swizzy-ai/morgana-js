/**
 * Custom object discovery.
 *
 * A custom object lives in `src/objects/*.ts`, one per file, default-exporting
 * `createCustomObject({ name, ... })`. The convention is the whole point: a
 * component downloaded from anywhere is installed by dropping one file in, with
 * no manifest to edit and no import graph to keep in sync.
 *
 * Only `name`, `render`, `defaultProps`, `state` and `events` are read here, and
 * they are read **from source, without executing the module**. A build must not
 * run a third-party library just to learn a component's name. The functions stay
 * in the module, and cross to the browser inside the bundle (`bundle.ts`).
 */
import fs from 'node:fs'
import path from 'node:path'
import { bundleCustomObjectModules, loadCustomObjectDefinition } from './bundle'
import type { CustomObjectDecl } from './ir'
import type { CustomObjectDefinition } from '@morgana/sdk'

/** Directories scanned for components, in priority order. */
export function customObjectDirs(dir: string): string[] {
  return [path.join(dir, 'src', 'objects'), path.join(dir, 'objects')].filter((d) => {
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

/** Read a source file, or null. */
function read(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

/** The string literal assigned to `key:`, e.g. `name: 'video-player'`. */
function readStringLiteral(src: string, key: string): string | null {
  const m = new RegExp(`\\b${key}\\s*:\\s*['"\`]([^'"\`]+)['"\`]`).exec(src)
  return m?.[1] ?? null
}

/** The body of an object literal assigned to `key:`, with nesting respected. */
function readObjectLiteral(src: string, key: string): { body: string; start: number; end: number } | null {
  const km = new RegExp(`\\b${key}\\s*:`).exec(src)
  if (!km) return null
  const open = src.indexOf('{', km.index)
  if (open === -1) return null
  let depth = 0
  let inStr: string | null = null
  for (let i = open; i < src.length; i++) {
    const c = src[i]!
    if (inStr) {
      if (c === '\\') i++
      else if (c === inStr) inStr = null
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      inStr = c
      continue
    }
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return { body: src.slice(open + 1, i), start: open + 1, end: i }
    }
  }
  return null
}

/**
 * Best-effort literal read of a prop/state defaults object.
 *
 * Nested objects and arrays are kept as source text; a value that is not a
 * literal becomes `undefined` and the caller falls back to the bundled
 * definition at build time. This only decides what the *IR* needs to know.
 */
function readLiteralObject(body: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  let i = 0
  while (i < body.length) {
    // key
    const km = /^\s*(?:'([\w$]+)'|"([\w$]+)"|([A-Za-z_$][\w$]*))\s*:/.exec(body.slice(i))
    if (!km) {
      i++
      continue
    }
    const key = km[1] ?? km[2] ?? km[3]!
    i += km[0].length
    // value: literal, or a balanced {}/[] we keep as-is
    const rest = body.slice(i)
    if (/^\s*['"`]/.test(rest)) {
      const sm = /^\s*(['"`])([\s\S]*?)\1/.exec(rest)
      if (sm) {
        out[key] = sm[2]
        i += sm[0].length
        continue
      }
    }
    if (/^\s*-?\d/.test(rest)) {
      const nm = /^\s*(-?\d+(?:\.\d+)?)/.exec(rest)
      if (nm) {
        out[key] = Number(nm[1])
        i += nm[0].length
        continue
      }
    }
    if (/^\s*(true|false|null)\b/.test(rest)) {
      const bm = /^\s*(true|false|null)\b/.exec(rest)
      if (bm) {
        out[key] = bm[1] === 'true' ? true : bm[1] === 'false' ? false : null
        i += bm[0].length
        continue
      }
    }
    const om = /^\s*[\[{]/.exec(rest)
    if (om) {
      const open = rest.indexOf(om[0]!.trim().charAt(0))
      let depth = 0
      let end = -1
      for (let j = open; j < rest.length; j++) {
        const c = rest[j]!
        if (c === '{' || c === '[') depth++
        else if (c === '}' || c === ']') {
          depth--
          if (depth === 0) {
            end = j
            break
          }
        }
      }
      if (end > 0) {
        out[key] = { __literal: rest.slice(open, end + 1) }
        i += open + end + 1
        continue
      }
    }
    // Not a literal — skip past the key and let the bundled definition supply it.
    i += 1
  }
  return out
}

/** `events: ['a','b']` as a flat list. */
function readStringArray(src: string, key: string): string[] {
  const m = new RegExp(`\\b${key}\\s*:\\s*\\[`).exec(src)
  if (!m) return []
  const open = m.index + m[0].length
  const close = src.indexOf(']', open)
  if (close === -1) return []
  const out: string[] = []
  for (const s of src.slice(open, close).matchAll(/['"`]([A-Za-z][\w-]*)['"`]/g)) out.push(s[1]!)
  return out
}

/**
 * Load the real definitions, functions and all.
 *
 * Discovery reads the serializable parts from source so the manifest can be
 * written without running anything; this is the other half — the compile lane
 * needs the actual `define` function, because it stamps real objects into the
 * IR. A component that throws while loading is a build error with its own stack.
 */
export async function loadCustomObjectDefinitions(
  dir: string,
  decls: CustomObjectDecl[],
  minify = false,
): Promise<Map<string, CustomObjectDefinition>> {
  const out = new Map<string, CustomObjectDefinition>()
  for (const decl of decls) {
    const definition = await loadCustomObjectDefinition(dir, decl.file, decl.name, minify)
    if (typeof definition['name'] !== 'string' || definition['name'] === '') {
      throw new Error(
        `custom object ${path.relative(dir, decl.file)}: the default export has no \`name\``,
      )
    }
    out.set(definition['name'], definition as unknown as CustomObjectDefinition)
  }
  return out
}

/**
 * Find every component in the project.
 *
 * A module in the directory without a `name` is a shared helper, which is
 * legal — it is simply not a component. Only complain if it looks like it meant
 * to be one.
 */
export function discoverCustomObjects(dir: string, warnings: string[] = []): CustomObjectDecl[] {
  const decls: CustomObjectDecl[] = []
  const claimedBy = new Map<string, string>()

  for (const root of customObjectDirs(dir)) {
    for (const file of listModuleFiles(root)) {
      const rel = path.relative(dir, file).split(path.sep).join('/')
      const src = read(file)
      if (src === null) continue

      const name = readStringLiteral(src, 'name')
      if (!name) {
        if (/\bcreateCustomObject\s*\(/.test(src)) {
          warnings.push(`custom object ${rel}: no \`name\` found — skipped`)
        }
        continue
      }

      const key = name.toLowerCase()
      const previous = claimedBy.get(key)
      if (previous) {
        warnings.push(`custom object "${name}" is declared twice (${previous} and ${rel}) — using ${rel}`)
        const idx = decls.findIndex((d) => d.name.toLowerCase() === key)
        if (idx >= 0) decls.splice(idx, 1)
      }
      claimedBy.set(key, rel)

      const defaults = readObjectLiteral(src, 'defaultProps') ?? readObjectLiteral(src, 'props')
      const state = readObjectLiteral(src, 'state')

      decls.push({
        name,
        file,
        // Default: a container. A component that sets `render` is choosing to
        // genuinely BE that built-in kind instead.
        render: readStringLiteral(src, 'render') ?? 'box',
        defaultProps: defaults ? readLiteralObject(defaults.body) : {},
        state: state ? readLiteralObject(state.body) : {},
        events: readStringArray(src, 'events'),
        // Matches both `onMount(...)` shorthand and `onMount: fn` — either is
        // browser code, and either means the component must be bundled.
        hasRuntimeCode: /on(?:Prepare|Mount|Update|Destroy)\s*[:(]/.test(src) || /methods\s*[:{]/.test(src),
        description: readStringLiteral(src, 'description') ?? undefined,
      })
    }
  }
  return decls
}

/**
 * Bundle every component into one browser script that registers them.
 * Returns null when the project has none, so nothing is emitted for the
 * common case.
 */
export async function bundleCustomObjects(
  projectDir: string,
  decls: CustomObjectDecl[],
  minify = false,
): Promise<string | null> {
  // Only components with browser code are worth shipping. A project of pure
  // `define` components gets no component bundle at all — which is the point of
  // composing instead of writing a renderer.
  const withRuntime = decls.filter((d) => d.hasRuntimeCode)
  if (withRuntime.length === 0) return null
  return bundleCustomObjectModules(projectDir, withRuntime, minify)
}
