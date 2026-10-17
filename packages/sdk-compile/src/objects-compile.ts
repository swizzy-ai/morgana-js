/**
 * Server objects at build time — find every `defineServerObject` module (the
 * project's own and installed libraries'), check it, and produce what the
 * hosts and the browser need:
 *
 *   dist/server/objects.json        ObjectMeta[] — shape, member names, access
 *   dist/server/objects/<name>.js   the definition as one self-contained ES module
 *   .morgana/objects.d.ts           ObjectRegistry augmentation, so ctx.objects is typed
 *
 * The definition is evaluated in Node to read its shape, the same way client
 * components are; its functions run later, on a host.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { bundleServerObject, loadModuleDefault } from './bundle'
import { validateObjectMeta, type AccessRule, type ObjectMeta } from './server-host/objects'

export interface CompiledServerObject {
  meta: ObjectMeta
  file: string
  /** npm package it came from, when it is a library object. */
  library?: string
  code: string
}

const camel = (s: string) => s.replace(/-([a-z0-9])/g, (_m, c: string) => c.toUpperCase())

function listFiles(root: string): string[] {
  const out: string[] = []
  const walk = (d: string) => {
    let items: fs.Dirent[] = []
    try {
      items = fs.readdirSync(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const it of items) {
      if (it.name.startsWith('.') || it.name === 'node_modules') continue
      const full = path.join(d, it.name)
      if (it.isDirectory()) walk(full)
      else if (/\.(ts|tsx|mts|js|mjs)$/.test(it.name) && !/\.d\.ts$/.test(it.name) && !/\.test\./.test(it.name)) out.push(full)
    }
  }
  walk(root)
  return out.sort()
}

/** Files that define server objects: own `src/server-objects`, plus libraries. */
export function objectSources(dir: string, libraries: string[] = []): Array<{ file: string; library?: string }> {
  const out: Array<{ file: string; library?: string }> = []
  for (const root of [path.join(dir, 'src', 'server-objects'), path.join(dir, 'server-objects')]) {
    for (const file of listFiles(root)) {
      if (/\bdefineServerObject\s*\(/.test(fs.readFileSync(file, 'utf8'))) out.push({ file })
    }
  }
  // A library declares its objects in package.json: { "morgana": { "objects": ["dist/chat-room.js"] } }.
  const require_ = createRequire(path.join(dir, 'package.json'))
  for (const lib of libraries) {
    let pkgFile: string
    try {
      pkgFile = require_.resolve(`${lib}/package.json`)
    } catch {
      throw new Error(`library "${lib}" (morgana.config libraries) is not installed — npm install ${lib}`)
    }
    const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8')) as { morgana?: { objects?: string[] } }
    const entries = pkg.morgana?.objects ?? []
    if (!entries.length) throw new Error(`library "${lib}" declares no objects (package.json "morgana": { "objects": [...] })`)
    for (const rel of entries) out.push({ file: path.join(path.dirname(pkgFile), rel), library: lib })
  }
  return out
}

const isFn = (v: unknown) => typeof v === 'function'
const isAsyncGen = (v: unknown) => isFn(v) && (v as { constructor?: { name?: string } }).constructor?.name === 'AsyncGeneratorFunction'

/** Read a loaded definition into ObjectMeta, or explain what is wrong with it. */
export function metaFromDefinition(def: unknown, where: string): ObjectMeta {
  const fail = (msg: string): never => {
    throw new Error(`${where}: ${msg}`)
  }
  if (!def || typeof def !== 'object') fail('the default export must be defineServerObject({ ... })')
  const d = def as Record<string, unknown>
  if (typeof d['name'] !== 'string') fail('`name` must be a string')
  const name = d['name'] as string
  const section = (key: string): Record<string, unknown> => {
    const v = d[key]
    if (v === undefined) return {}
    if (!v || typeof v !== 'object' || Array.isArray(v)) fail(`\`${key}\` must be an object`)
    return v as Record<string, unknown>
  }
  if (d['streams'] !== undefined) fail('there is no `streams` section — write a streaming method as `async function*` in `methods`')
  const methods = section('methods')
  const jobs = section('jobs')
  const computed = section('computed')
  const on = section('on')
  for (const [k, v] of Object.entries(on)) if (!isFn(v)) fail(`on['${k}'] must be a function (self, data) => …`)
  for (const [k, v] of Object.entries(methods)) if (!isFn(v)) fail(`methods.${k} must be a function (or async function* to stream)`)
  for (const [k, v] of Object.entries(jobs)) if (!isFn(v)) fail(`jobs.${k} must be a function`)
  for (const [k, v] of Object.entries(computed)) if (!isFn(v)) fail(`computed.${k} must be a function of state`)
  if (d['onCreate'] !== undefined && !isFn(d['onCreate'])) fail('onCreate must be a function')
  const state = section('state')
  try {
    if (JSON.stringify(JSON.parse(JSON.stringify(state))) !== JSON.stringify(state)) fail('`state` must be plain JSON data')
  } catch {
    fail('`state` must be plain JSON data')
  }
  const collections: ObjectMeta['collections'] = {}
  for (const [c, spec] of Object.entries(section('collections'))) {
    const cols = (spec as { columns?: unknown })?.columns
    if (!Array.isArray(cols) || cols.some((x) => !x || typeof (x as { name?: unknown }).name !== 'string')) {
      fail(`collections.${c}.columns must be [{ name, type }]`)
    }
    collections[c] = { columns: (cols as Array<{ name: string; type?: string }>).map((x) => ({ name: x.name, ...(x.type ? { type: x.type } : {}) })) }
  }
  const meta: ObjectMeta = {
    name,
    state: JSON.parse(JSON.stringify(state)),
    collections,
    methods: Object.keys(methods),
    streaming: Object.keys(methods).filter((k) => isAsyncGen(methods[k])),
    jobs: Object.keys(jobs),
    computed: Object.keys(computed),
    access: section('access') as Record<string, AccessRule>,
    hasOnCreate: isFn(d['onCreate']),
    ...(Object.keys(on).length ? { on: Object.keys(on) } : {}),
  }
  if (d['channel'] !== undefined) {
    const ch = d['channel'] as { name?: unknown; receive?: unknown } | null
    if (!ch || typeof ch !== 'object') fail('`channel` must be { name: "<prefix>{name}", receive: "<method>" }')
    meta.channel = { name: String(ch!.name ?? ''), receive: String(ch!.receive ?? '') }
  }
  const errors = validateObjectMeta(meta)
  if (errors.length) fail(errors.join('; '))
  return meta
}

export async function compileServerObjects(dir: string, libraries: string[] = [], warnings: string[] = []): Promise<CompiledServerObject[]> {
  const out: CompiledServerObject[] = []
  const seen = new Map<string, string>()
  for (const { file, library } of objectSources(dir, libraries)) {
    const where = library ? `${library} (${path.basename(file)})` : path.relative(dir, file)
    const meta = metaFromDefinition(await loadModuleDefault(dir, file, `object ${where}`), where)
    const clash = seen.get(meta.name)
    if (clash) throw new Error(`two server objects are named "${meta.name}": ${clash} and ${where}`)
    seen.set(meta.name, where)
    const code = await bundleServerObject(dir, file, meta.name, warnings)
    out.push({ meta, file, library, code })
  }
  return out
}

/** The browser's view: enough to build proxies, nothing about internals. */
export function browserObjectMeta(objects: CompiledServerObject[]): Record<string, { name: string; methods: string[]; streaming: string[] }> {
  return Object.fromEntries(
    objects.map(({ meta }) => [camel(meta.name), { name: meta.name, methods: meta.methods, streaming: meta.streaming }]),
  )
}

/** `.morgana/objects.d.ts` — types `ctx.objects.<name>` from each definition. */
export function objectTypesDts(dir: string, objects: CompiledServerObject[]): string {
  const outDir = path.join(dir, '.morgana')
  const lines = ['// Generated by `morgana types` / `morgana build` — do not edit.', "import type {} from '@studiomorgana/sdk'"]
  const entries: string[] = []
  objects.forEach((o, i) => {
    const spec = o.library ?? `./${path.relative(outDir, o.file).replace(/\\/g, '/').replace(/\.(ts|tsx|mts|js|mjs)$/, '')}`
    lines.push(`import type __o${i} from ${JSON.stringify(spec)}`)
    entries.push(`    ${JSON.stringify(camel(o.meta.name))}: typeof __o${i}`)
  })
  lines.push("declare module '@studiomorgana/sdk' {", '  interface ObjectRegistry {', ...entries, '  }', '}', '')
  return lines.join('\n')
}

export { camel as objectKey }
