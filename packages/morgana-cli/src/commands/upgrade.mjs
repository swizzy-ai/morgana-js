/**
 * `morgana upgrade` — move a project's @studiomorgana/* packages to the latest
 * published versions, then install with the package manager the project uses.
 *
 * Only registry ranges are rewritten. `file:`, `link:`, `workspace:` and git
 * specs are local development links, so they stay as they are and are reported.
 * Packages version independently, so each one is looked up on its own `latest`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

import { say, row, bold, green, dim } from '../ui.mjs'

const SCOPE = '@studiomorgana/'
const REGISTRY = 'https://registry.npmjs.org'
const SECTIONS = ['dependencies', 'devDependencies']

/** A spec that points at a directory, a repo or a URL rather than a published range. */
const isLocal = (spec) => /^(file:|link:|workspace:|git|https?:|\.|\/)/.test(spec) || spec.includes('/')

async function latestVersion(name) {
  const res = await fetch(`${REGISTRY}/${name.replace('/', '%2f')}/latest`, {
    headers: { accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`${name}: the registry answered ${res.status}`)
  const { version } = await res.json()
  return version
}

/**
 * The lockfile says which manager the project actually uses. `pnpm-workspace.yaml`
 * alone is not enough: `morgana init` writes it into every project, npm users too.
 */
export function packageManagerFor(root) {
  const has = (f) => fs.existsSync(path.join(root, f))
  if (has('pnpm-lock.yaml')) return 'pnpm'
  if (has('package-lock.json')) return 'npm'
  if (has('pnpm-workspace.yaml')) return 'pnpm'
  return 'npm'
}

export async function upgrade({ dir, dryRun = false, install = true } = {}) {
  const root = path.resolve(dir ?? process.cwd())
  const file = path.join(root, 'package.json')
  if (!fs.existsSync(file)) {
    throw new Error(`no package.json in ${root} — run morgana upgrade from a project directory`)
  }
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8'))

  const checked = []
  const local = []
  for (const section of SECTIONS) {
    for (const [name, spec] of Object.entries(pkg[section] ?? {})) {
      if (!name.startsWith(SCOPE)) continue
      if (isLocal(spec)) {
        local.push({ name, spec })
        continue
      }
      checked.push({ section, name, from: spec, to: `^${await latestVersion(name)}` })
    }
  }

  say(bold(`morgana upgrade — ${pkg.name ?? path.basename(root)}`))
  say()
  for (const c of checked) {
    const state = c.from === c.to ? dim(`${c.to} (current)`) : `${c.from} → ${green(c.to)}`
    say(row(c.name, state, 34))
  }
  for (const l of local) say(row(l.name, dim(`${l.spec} (local link, left as is)`), 34))

  const changes = checked.filter((c) => c.from !== c.to)
  if (!changes.length) {
    say()
    say(green('already on the latest versions'))
    return { changed: 0 }
  }
  if (dryRun) {
    say()
    say(dim(`dry run — ${changes.length} change(s), nothing written`))
    return { changed: changes.length, dryRun: true }
  }

  for (const c of changes) pkg[c.section][c.name] = c.to
  fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`)
  say()
  say(`${green('updated')} package.json (${changes.length} package(s))`)

  if (!install) {
    say(dim('skipped install — run your package manager install next'))
    return { changed: changes.length }
  }

  const pm = packageManagerFor(root)
  say(dim(`installing with ${pm}…`))
  // Windows ships pnpm and npm as .cmd shims, which need a shell. Only the fixed
  // command string goes through cmd; nothing from the project is interpolated.
  const opts = { cwd: root, stdio: 'inherit' }
  const result =
    process.platform === 'win32'
      ? spawnSync('cmd', ['/d', '/s', '/c', `${pm} install`], opts)
      : spawnSync(pm, ['install'], opts)
  if (result.status !== 0) throw new Error(`${pm} install failed (exit ${result.status})`)
  say(green('upgraded'))
  return { changed: changes.length, pm }
}
