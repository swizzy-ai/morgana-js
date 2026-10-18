/**
 * The plugin host: load the plugins a project lists, build every definition
 * they read into files, and resolve references to those files.
 *
 *   plugins: ['@studiomorgana/assets']   →  src/assets/*.ts  →  dist/assets/_artifacts/…
 *
 * Every output is keyed by a hash of the definition's bundle (which inlines
 * everything it imports), the plugin's own bundle and the variant. A key that
 * has been built before is taken from `.morgana/artifacts/` and never rebuilt,
 * so an unchanged project builds its artifacts in the time it takes to hash
 * them. Outputs ship through the same path as downloaded fonts.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import { points, type Artifact, type Make, type MorganaConfig, type PluginDefinition } from '@studiomorgana/sdk'

import { loadModuleWithSource } from './bundle'
import { locateError } from './source-errors'
import type { ProjectIR } from './ir'

export interface LoadedPlugin {
  def: PluginDefinition
  /** What the project's config named. */
  spec: string
  /** Fingerprint of the plugin's code: a new release rebuilds what it makes. */
  fingerprint: string
  /** The plugin's bundle, to trace an error inside it back to its source. */
  code: string
}

export interface ArtifactBuild {
  artifacts: Artifact[]
  /** Files for dist/assets, in the shape the emitter takes. */
  files: Array<{ rel: string; file: string }>
  /** Reference schemes the installed plugins answer to (`asset`). */
  schemes: Set<string>
  /** `asset:robot@walk#model` → `/assets/_artifacts/assets/1a2b3c4d5e6f/robot.glb`, or undefined. */
  resolve(ref: string): string | undefined
  /** How many artifacts were built now rather than taken from the cache. */
  built: number
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex')

// ── loading ────────────────────────────────────────────────────────────────

/** Where to load a plugin from: a file path, or a package's `/plugin` export resolved from the project. */
function pluginSource(dir: string, spec: string): { file: string; resolveFrom?: string } {
  if (spec.startsWith('.') || path.isAbsolute(spec)) {
    const file = path.resolve(dir, spec)
    if (!fs.existsSync(file)) throw new Error(`plugin "${spec}" — no such file`)
    return { file }
  }
  // Checked with require for a clear "not installed" message, but loaded
  // through esbuild's own resolution so the package's ES module build is used.
  const require_ = createRequire(path.join(dir, 'noop.js'))
  try {
    require_.resolve(`${spec}/plugin`)
  } catch {
    throw new Error(`plugin "${spec}" is not installed — run \`npm install ${spec}\``)
  }
  return { file: `${spec}/plugin`, resolveFrom: dir }
}

/** Load the plugins a project lists, ordered so each builds after the ones it reads. */
export async function loadPlugins(dir: string, specs: readonly string[]): Promise<LoadedPlugin[]> {
  const loaded: LoadedPlugin[] = []
  for (const spec of specs) {
    const source = pluginSource(dir, spec)
    const { value, code } = await loadModuleWithSource(dir, source.file, `plugin "${spec}"`, source.resolveFrom)
    const def = value as PluginDefinition | undefined
    if (!def || typeof def !== 'object' || typeof def.name !== 'string' || typeof def.makes !== 'function' || typeof def.reads !== 'string') {
      throw new Error(`plugin "${spec}" must \`export default definePlugin({ name, reads, makes, … })\``)
    }
    if (loaded.some((p) => p.def.name === def.name)) throw new Error(`two plugins are called "${def.name}"`)
    if (def.refers && loaded.some((p) => p.def.refers === def.refers)) {
      throw new Error(`plugins "${loaded.find((p) => p.def.refers === def.refers)!.def.name}" and "${def.name}" both answer to "${def.refers}:"`)
    }
    loaded.push({ def, spec, fingerprint: sha(code).slice(0, 16), code })
  }

  // Order by `after`: a plugin that reads another's outputs builds second.
  const byName = new Map(loaded.map((p) => [p.def.name, p]))
  const ordered: LoadedPlugin[] = []
  const state = new Map<string, 'visiting' | 'done'>()
  const visit = (p: LoadedPlugin, trail: string[]) => {
    if (state.get(p.def.name) === 'done') return
    if (state.get(p.def.name) === 'visiting') throw new Error(`plugins build after each other in a circle: ${[...trail, p.def.name].join(' → ')}`)
    state.set(p.def.name, 'visiting')
    for (const dep of p.def.after ?? []) {
      const d = byName.get(dep)
      if (!d) throw new Error(`plugin "${p.def.name}" builds after "${dep}", which isn't installed`)
      visit(d, [...trail, p.def.name])
    }
    state.set(p.def.name, 'done')
    ordered.push(p)
  }
  for (const p of loaded) visit(p, [])
  return ordered
}

// ── building ───────────────────────────────────────────────────────────────

function definitionFiles(root: string): string[] {
  if (!fs.existsSync(root)) return []
  const out: string[] = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__' && entry.name !== 'node_modules') out.push(...definitionFiles(full))
    } else if (/\.(m?ts|m?js)$/.test(entry.name) && !entry.name.endsWith('.d.ts') && !/\.test\./.test(entry.name)) {
      out.push(full)
    }
  }
  return out.sort()
}

function seedOf(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

function seeded(seed: number): () => number {
  let a = (seed * 2654435761) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}


interface CachedMeta {
  plugin: string
  name: string
  variant: string
  source: string
  hash: string
  files: Array<{ role: string; name: string }>
  meta: Record<string, unknown>
}

class PluginFailure extends Error {}

export interface BuildArtifactsOptions {
  dir: string
  plugins: LoadedPlugin[]
  warnings: string[]
  /** Ignore the cache and build everything. */
  force?: boolean
  /** The project's point basis (`config.points`), read through `make.points`. */
  points?: MorganaConfig['points']
}

export async function buildArtifacts(opts: BuildArtifactsOptions): Promise<ArtifactBuild> {
  const { dir, plugins, warnings } = opts
  const cacheRoot = path.join(dir, '.morgana', 'artifacts')
  const artifacts: Artifact[] = []
  const files: ArtifactBuild['files'] = []
  const schemeOf = new Map(plugins.filter((p) => p.def.refers).map((p) => [p.def.refers!, p.def.name]))
  let built = 0
  const { words: pointWords, ...pointBasis } = opts.points ?? {}
  let reader: ReturnType<typeof points>
  try {
    reader = points({ basis: pointBasis, words: pointWords })
    for (const kind of Object.keys(pointBasis)) reader.basis(kind as keyof typeof pointBasis)
  } catch (err) {
    throw new Error(`morgana.config.ts points: ${(err as Error).message}`)
  }
  // A set basis changes what amounts mean, so it is part of every output's
  // key. Projects that set none keep the keys they always had.
  const pointsKey = opts.points ? [JSON.stringify(opts.points)] : []

  const find = (ref: string): { artifact: Artifact; role: string } | undefined => {
    const m = /^([a-z][a-z0-9-]*):([^@#\s]+)(?:@([^#\s]+))?(?:#(\S+))?$/.exec(ref)
    if (!m) return undefined
    const plugin = schemeOf.get(m[1])
    if (!plugin) return undefined
    const mine = artifacts.filter((a) => a.plugin === plugin && a.name === m[2])
    const artifact = m[3] ? mine.find((a) => a.variant === m[3]) : (mine.find((a) => a.variant === 'default') ?? mine[0])
    if (!artifact) return undefined
    const role = m[4] ?? Object.keys(artifact.files)[0]
    return artifact.files[role] ? { artifact, role } : undefined
  }

  for (const plugin of plugins) {
    const { def } = plugin
    const root = path.join(dir, def.reads)
    const claimed = new Map<string, string>()
    for (const file of definitionFiles(root)) {
      const source = path.relative(dir, file).split(path.sep).join('/')
      const { value, code } = await loadModuleWithSource(dir, file, `${def.name} definition ${source}`)
      const definition = value as Record<string, unknown> | undefined
      if (!definition || typeof definition !== 'object') {
        // A file without a default export is a shared helper — legal. Only
        // complain when it looks like it meant to be a definition.
        const text = fs.readFileSync(file, 'utf8')
        if (def.defines.some((word) => text.includes(`${word}(`))) {
          throw new Error(`${source}: must \`export default ${def.defines[0]}({ … })\``)
        }
        continue
      }
      if (typeof definition['name'] !== 'string' || !definition['name']) throw new Error(`${source}: a ${def.defines[0]} needs a \`name\``)
      const name = definition['name'] as string

      const variants = def.variants?.(definition) ?? ['default']
      for (const variant of variants) {
        const id = `${name}@${variant}`
        if (claimed.has(id)) throw new Error(`${source}: "${name}" (${variant}) is already defined in ${claimed.get(id)}`)
        claimed.set(id, source)

        const hash = sha(JSON.stringify([def.name, plugin.fingerprint, def.version ?? '', variant, code, ...pointsKey])).slice(0, 16)
        const cacheDir = path.join(cacheRoot, hash)
        const metaFile = path.join(cacheDir, 'meta.json')
        let meta: CachedMeta

        if (!opts.force && fs.existsSync(metaFile)) {
          meta = JSON.parse(fs.readFileSync(metaFile, 'utf8')) as CachedMeta
        } else {
          const written: Array<{ role: string; name: string; data: Uint8Array | string }> = []
          let described: Record<string, unknown> = {}
          const seed = def.seed?.(definition, variant) ?? seedOf(`${name}/${variant}`)
          const random = seeded(seed)
          const make: Make = {
            variant,
            seed,
            source,
            random,
            between: (min, max) => min + (max - min) * random(),
            pick: (items) => items[Math.floor(random() * items.length)],
            file(role, fileName, data) {
              if (/[\\/]/.test(fileName)) make.fail(`file names can't contain folders: "${fileName}"`)
              if (written.some((w) => w.role === role)) make.fail(`two files with the role "${role}"`)
              written.push({ role, name: fileName, data })
            },
            describe(m) { described = { ...described, ...m } },
            use(ref) {
              const scheme = ref.split(':')[0]
              const owner = schemeOf.get(scheme)
              if (owner && owner !== def.name && !(def.after ?? []).includes(owner)) {
                make.fail(`uses "${ref}", but the ${def.name} plugin doesn't build after ${owner}`)
              }
              return find(ref)?.artifact
            },
            warn(text) { warnings.push(`${source}: ${text}`) },
            fail(text): never { throw new PluginFailure(`${source}: ${text}`) },
            points: reader,
          }
          try {
            await def.makes(definition, make)
          } catch (err) {
            if (err instanceof PluginFailure) throw err
            // The definition's own code (a `build` function) first, then the plugin's.
            const where = locateError(err, code) ?? locateError(err, plugin.code)
            throw new Error(`${source}: the ${def.name} plugin failed${where ? ` at ${where}` : ''} — ${err instanceof Error ? err.message : String(err)}`)
          }
          if (!written.length) make.fail('made no files')

          // Write into a fresh folder, then move it into place: a half-written
          // build is never mistaken for a finished one.
          const tmp = `${cacheDir}.tmp-${process.pid}`
          fs.rmSync(tmp, { recursive: true, force: true })
          fs.mkdirSync(tmp, { recursive: true })
          for (const w of written) fs.writeFileSync(path.join(tmp, w.name), w.data)
          meta = { plugin: def.name, name, variant, source, hash, files: written.map(({ role, name: n }) => ({ role, name: n })), meta: described }
          fs.writeFileSync(path.join(tmp, 'meta.json'), JSON.stringify(meta, null, 2))
          fs.rmSync(cacheDir, { recursive: true, force: true })
          fs.renameSync(tmp, cacheDir)
          built++
        }

        const published: Record<string, string> = {}
        let bytes = 0
        for (const f of meta.files) {
          // One folder per build: a new build is a new URL (so files cache forever),
          // and files of one artifact can still name each other (an atlas → its sheet).
          const rel = `_artifacts/${def.name}/${hash.slice(0, 12)}/${f.name}`
          const onDisk = path.join(cacheDir, f.name)
          files.push({ rel, file: onDisk })
          published[f.role] = `/assets/${rel}`
          bytes += fs.statSync(onDisk).size
        }
        artifacts.push({ plugin: def.name, name, variant, hash, source, files: published, meta: meta.meta, bytes })
      }
    }
  }

  // The manifest ships too: runtimes and tools find artifacts by name through it.
  if (artifacts.length) {
    fs.mkdirSync(cacheRoot, { recursive: true })
    const manifestFile = path.join(cacheRoot, 'manifest.json')
    fs.writeFileSync(manifestFile, `${JSON.stringify({ artifacts }, null, 2)}\n`)
    files.push({ rel: '_artifacts/manifest.json', file: manifestFile })
  }

  return {
    artifacts,
    files,
    schemes: new Set(schemeOf.keys()),
    resolve: (ref) => {
      const hit = find(ref)
      return hit ? hit.artifact.files[hit.role] : undefined
    },
    built,
  }
}

/**
 * Replace references in object props (`src: 'asset:coin'`) with the files'
 * URLs. Only schemes an installed plugin answers to are touched, so a prop
 * that merely contains a colon is left alone.
 */
export function resolveArtifactRefs(ir: ProjectIR, build: ArtifactBuild, warnings: string[]): void {
  if (!build.schemes.size) return
  for (const [id, node] of ir.objects) {
    const props = node.props as Record<string, unknown> | undefined
    if (!props) continue
    for (const [key, value] of Object.entries(props)) {
      if (typeof value !== 'string') continue
      const m = /^([a-z][a-z0-9-]*):\S+$/.exec(value)
      if (!m || !build.schemes.has(m[1])) continue
      const url = build.resolve(value)
      if (url) props[key] = url
      else warnings.push(`${id}.${key}: "${value}" names nothing that was built`)
    }
  }
}
