#!/usr/bin/env node
/**
 * `pnpm release:bump [patch|minor|major] [--dry-run]` — bump only the packages
 * that changed since they were last released.
 *
 * "Last released" is the tag `pnpm release` leaves per package
 * (`@studiomorgana/sdk@0.5.2`), or the old whole-repo tag (`v0.5.1`) for a
 * version published before per-package tags. A package with neither is
 * treated as changed — bumping too much is safe, shipping stale code is not.
 *
 * Changes to tests alone do not count. A package also bumps when a dependency's
 * new version falls outside the range it published with (`^0.5.1` does not
 * accept `0.6.0`), so every published set stays installable together.
 *
 * Then `pnpm release` publishes exactly the bumped ones: it skips any version
 * already on npm.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const level = args.find((a) => ['patch', 'minor', 'major'].includes(a)) ?? 'patch'

const PACKAGES =['sdk', 'helpers', 'assets', 'wizard', 'morgana-agents', 'sdk-compile', 'morgana-cli', 'morgana-eject']

const git = (cmd) => execSync(`git ${cmd}`, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
const tagExists = (t) => {
  try {
    git(`rev-parse --verify --quiet "refs/tags/${t}"`)
    return true
  } catch {
    return false
  }
}

const parse = (v) => v.split('.').map(Number)
const bump = (v, how) => {
  const [a, b, c] = parse(v)
  return how === 'major' ? `${a + 1}.0.0` : how === 'minor' ? `${a}.${b + 1}.0` : `${a}.${b}.${c + 1}`
}
/** Does `^from` accept `to`? npm's caret: the left-most non-zero part is fixed. */
const caretAccepts = (from, to) => {
  const [a, b, c] = parse(from)
  const [x, y, z] = parse(to)
  if (a > 0) return x === a && (y > b || (y === b && z >= c))
  if (b > 0) return x === 0 && y === b && z >= c
  return x === 0 && y === 0 && z === c
}

const pkgs = PACKAGES.map((dir) => {
  const file = path.join(root, 'packages', dir, 'package.json')
  const json = JSON.parse(fs.readFileSync(file, 'utf8'))
  return { dir, file, json, name: json.name, version: json.version, next: null, why: '' }
})
const byName = new Map(pkgs.map((p) => [p.name, p]))

// 1. Changed since its own last release.
for (const p of pkgs) {
  const base = [`${p.name}@${p.version}`, `v${p.version}`].find(tagExists)
  if (!base) {
    p.next = bump(p.version, level)
    p.why = `no release tag for ${p.version}`
    continue
  }
  const changed = git(`diff --name-only ${base} HEAD -- packages/${p.dir}`)
    .split('\n')
    .filter((f) => f && !/(__tests__|\.test\.[cm]?[jt]sx?$)/.test(f))
  if (changed.length) {
    p.next = bump(p.version, level)
    p.why = `${changed.length} file(s) changed since ${base}`
  }
}

// 2. Dependents whose published range would not accept a dependency's new version.
for (let again = true; again; ) {
  again = false
  for (const p of pkgs) {
    if (p.next) continue
    const deps = { ...p.json.dependencies, ...p.json.peerDependencies }
    for (const name of Object.keys(deps)) {
      const dep = byName.get(name)
      if (dep?.next && !caretAccepts(dep.version, dep.next)) {
        p.next = bump(p.version, 'patch')
        p.why = `${name} ${dep.version} → ${dep.next} is outside ^${dep.version}`
        again = true
        break
      }
    }
  }
}

const bumped = pkgs.filter((p) => p.next)
if (!bumped.length) {
  console.log('nothing changed since the last release')
  process.exit(0)
}
for (const p of pkgs) {
  console.log(`  ${p.name.padEnd(28)} ${p.next ? `${p.version} → ${p.next}   (${p.why})` : `${p.version}   unchanged`}`)
}
if (dryRun) process.exit(0)

for (const p of bumped) {
  p.json.version = p.next
  fs.writeFileSync(p.file, JSON.stringify(p.json, null, 2) + '\n')
}
console.log(`\nbumped ${bumped.length}. Commit, then \`pnpm release\`.`)
