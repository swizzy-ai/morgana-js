/**
 * `morgana artifacts` — what the project's plugins build, outside a full build.
 *
 *   morgana artifacts list                     every artifact: plugin, name, variant, hash, size
 *   morgana artifacts dump [name…] [--out d]   plain-named files any tool can open
 *
 * Both go through the same cache as `morgana build` (`.morgana/artifacts/`),
 * so an unchanged artifact is read, never rebuilt. `dump` exists for handing
 * files to something that isn't Morgana: a glTF to Blender or Godot, a sprite
 * sheet to an engine.
 */
import fs from 'node:fs'
import path from 'node:path'
import { buildArtifacts, loadPlugins, scanProject } from '@studiomorgana/sdk-compile'
import { UsageError } from '../args.mjs'
import { say, row, dim, yellow } from '../ui.mjs'

const kb = (n) => (n / 1024).toFixed(1) + 'K'

async function build(dir, force) {
  const scan = scanProject({ dir })
  const specs = scan.config.plugins ?? []
  if (!specs.length) throw new UsageError('this project lists no plugins — add one to morgana.config.ts: plugins: [\'@studiomorgana/assets\']')
  const warnings = []
  const result = await buildArtifacts({ dir, plugins: await loadPlugins(dir, specs), warnings, force })
  for (const w of warnings) say(row(yellow('warning'), yellow(w)))
  return result
}

const label = (a) => (a.variant === 'default' ? a.name : `${a.name}@${a.variant}`)

/** `heart.svg` of variant `half` → `heart.half.svg`, so variants never overwrite each other. */
function dumpName(file, a) {
  if (a.variant === 'default') return file
  return file.startsWith(`${a.name}.`) ? `${a.name}.${a.variant}.${file.slice(a.name.length + 1)}` : `${a.variant}-${file}`
}

export async function artifacts({ action, names = [], dir = process.cwd(), out, force = false, remote = false, url, project, env, token }) {
  if ((action === 'list' || action === '') && remote) {
    const { resolveTarget, resolveCredential } = await import('./deploy.mjs')
    const { remoteArtifacts, formatBytes } = await import('../lib/artifacts-remote.mjs')
    const { base, projectId, envName } = resolveTarget({ url, project, env })
    const { bearer } = await resolveCredential({ base, token })
    const map = await remoteArtifacts({ base, bearer, projectId, envName })
    const entries = Object.entries(map)
    for (const [key, ref] of entries) say(row(key.replace(/^assets\/_artifacts\//, ''), `${ref.sha.slice(0, 12)}  ${formatBytes(ref.size).padStart(9)}  ${dim(ref.contentType)}`))
    say()
    say(dim(`${entries.length} artifact file(s) live for ${projectId} (${envName}) on ${base}`))
    return
  }

  if (action === 'push') {
    // Pre-warm the store: build (or read from the cache) and upload what the
    // cloud lacks. The next deploy then finds nothing new to send.
    const { resolveTarget, resolveCredential } = await import('./deploy.mjs')
    const { describeFiles, formatBytes, planArtifacts, uploadArtifacts } = await import('../lib/artifacts-remote.mjs')
    const result = await build(dir, force)
    const files = describeFiles(result.files.filter((f) => !f.rel.endsWith('manifest.json')).map((f) => ({ key: `assets/${f.rel}`, file: f.file })))
    const { base, projectId } = resolveTarget({ url, project, env })
    const { bearer } = await resolveCredential({ base, token })
    const plan = await planArtifacts({ base, bearer, projectId, files })
    if (!plan.supported) throw new UsageError(`${base} has no artifact store — the worker needs updating`)
    const up = await uploadArtifacts({ base, bearer, projectId, files, missing: plan.missing, onUpload: (f) => say(row('uploaded', `${f.key.replace(/^assets\/_artifacts\//, '')}  ${dim(formatBytes(f.size))}`)) })
    say()
    say(dim(`${up.uploaded} uploaded (${formatBytes(up.bytes)}), ${new Set(files.map((f) => f.sha)).size - up.uploaded} already in the cloud`))
    return
  }

  if (action === 'list' || action === '') {
    const result = await build(dir, force)
    for (const a of result.artifacts) {
      const roles = Object.keys(a.files).join(' ')
      say(row(`${a.plugin}  ${label(a)}`, `${a.hash.slice(0, 12)}  ${kb(a.bytes).padStart(8)}  ${dim(roles)}`))
    }
    say()
    say(dim(`${result.artifacts.length} artifacts, ${result.built} built now, ${result.artifacts.length - result.built} from the cache`))
    return
  }

  if (action === 'dump') {
    const result = await build(dir, force)
    const wanted = names.length
      ? result.artifacts.filter((a) => names.includes(a.name) || names.includes(label(a)))
      : result.artifacts
    if (!wanted.length) throw new UsageError(`nothing called ${names.join(', ')} — \`morgana artifacts list\` shows what there is`)
    const target = path.resolve(dir, out || 'exported')
    fs.mkdirSync(target, { recursive: true })
    const onDisk = new Map(result.files.map((f) => [`/assets/${f.rel}`, f.file]))
    for (const a of wanted) {
      const written = []
      const renamed = new Map(Object.values(a.files).map((url) => [path.basename(url), dumpName(path.basename(url), a)]))
      for (const url of Object.values(a.files)) {
        const name = renamed.get(path.basename(url))
        let data = fs.readFileSync(onDisk.get(url))
        // Files of one artifact may name each other (an atlas → its sheet):
        // keep those names right after a variant rename.
        if (name.endsWith('.json') && a.variant !== 'default') {
          let text = data.toString('utf8')
          for (const [from, to] of renamed) text = text.split(JSON.stringify(from)).join(JSON.stringify(to))
          data = Buffer.from(text)
        }
        fs.writeFileSync(path.join(target, name), data)
        written.push(name)
      }
      say(row(label(a), written.join('  ')))
    }
    say()
    say(dim(`${wanted.length} artifacts → ${path.relative(process.cwd(), target) || '.'}`))
    return
  }

  throw new UsageError(`unknown action "${action}" — use list, dump or push`)
}
