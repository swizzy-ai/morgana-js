#!/usr/bin/env node
/**
 * `pnpm release` — publish the @studiomorgana packages whose version is not on
 * npm yet. Pair it with `pnpm release:bump`, which bumps only what changed.
 *
 *   pnpm release:bump        bump the packages that changed since their last release
 *   pnpm release             gate, then publish the new versions, then tag + push
 *   pnpm release --dry-run   gate, then `pnpm publish --dry-run`; nothing leaves the machine
 *   pnpm release:fast        build only — no typecheck/test. For re-running after a
 *                            gate that already passed (e.g. a 2FA timeout mid-publish)
 *   --otp=123456             one-time code, for an npm account with 2FA on writes
 *                            (or set NPM_OTP; or use a granular token that bypasses 2FA)
 *
 * Packages version independently. Each one published is tagged
 * `<name>@<version>`, which is how the next `release:bump` knows what changed.
 *
 * Re-runnable. A package whose version is already on npm is skipped, so a run
 * that dies halfway (network, 2FA timeout) is finished by running it again.
 *
 * Publishes with pnpm, never npm: pnpm rewrites `workspace:^` to the real
 * version in the tarball; npm would ship the literal `workspace:^` and every
 * install would fail. Auth is the npm login (`npm login`) — pnpm reads it.
 */
import { execSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dryRun = process.argv.includes('--dry-run')
const skipChecks = process.argv.includes('--skip-checks')
// An account with 2FA on writes needs a one-time code per publish; without one
// the registry answers a scoped PUT with a misleading 404. A code lasts ~30s,
// which is why the publishes below skip the per-package rebuild.
const otp = process.argv.find((a) => a.startsWith('--otp='))?.slice(6) || process.env.NPM_OTP || ''

/** Dependency order: each package publishes after everything it depends on. */
const PACKAGES = ['sdk', 'helpers', 'wizard', 'morgana-agents', 'sdk-compile', 'morgana-cli', 'morgana-eject']

const sh = (cmd, opts = {}) => execSync(cmd, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim()
const run = (cmd, args, cwd = root) => {
  // A shell only where Windows needs one to find `pnpm.cmd`. It joins args
  // unquoted, so git — whose tag message has a space — runs without it.
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: cmd !== 'git' })
  if (r.status !== 0) fail(`${cmd} ${args.join(' ')} failed (exit ${r.status})`)
}
const step = (msg) => console.log(`\n\x1b[1m▸ ${msg}\x1b[0m`)
function fail(msg) {
  console.error(`\n\x1b[31m✗ ${msg}\x1b[0m`)
  process.exit(1)
}
const onNpm = (p) => {
  try {
    return sh(`npm view ${p.name}@${p.version} version`) === p.version
  } catch {
    return false // 404 — not published yet
  }
}

const pkgs = PACKAGES.map((dir) => {
  const json = JSON.parse(fs.readFileSync(path.join(root, 'packages', dir, 'package.json'), 'utf8'))
  return { dir, name: json.name, version: json.version, cwd: path.join(root, 'packages', dir) }
})

// ── Preflight ────────────────────────────────────────────────────────────────
step('preflight')

let user = ''
try {
  user = sh('npm whoami')
} catch {
  fail('not logged in to npm — run `npm login` first')
}
console.log(`  npm user  ${user}`)

const branch = sh('git rev-parse --abbrev-ref HEAD')
if (branch !== 'main') fail(`releases go from main (on ${branch})`)
if (!dryRun && sh('git status --porcelain')) fail('working tree is not clean — commit first')

const todo = pkgs.filter((p) => !onNpm(p))
for (const p of pkgs) console.log(`  ${p.name.padEnd(28)} ${p.version}${todo.includes(p) ? '   → publish' : ''}`)
if (!todo.length) {
  step('every version is already on npm — run `pnpm release:bump` after changing a package')
  process.exit(0)
}

// ── Gate ─────────────────────────────────────────────────────────────────────
// Every published package builds — a new one may depend on an unchanged one —
// but only the ones being published are typechecked and tested.
step('build')
run('pnpm', [...pkgs.flatMap((p) => ['--filter', p.name]), 'run', 'build'])
const gated = todo.flatMap((p) => ['--filter', p.name])
if (skipChecks) {
  step('typecheck + test skipped (--skip-checks)')
} else {
  step('typecheck')
  run('pnpm', [...gated, 'run', 'typecheck'])
  step('test')
  run('pnpm', [...gated, 'run', 'test'])
}

// ── Publish ──────────────────────────────────────────────────────────────────
for (const p of todo) {
  step(`${dryRun ? 'dry-run ' : ''}publish ${p.name}@${p.version}`)
  // --no-git-checks: the clean-tree / branch checks above already ran, and pnpm's
  // own check refuses a dry run on a dirty tree.
  // --ignore-scripts: everything was built above; re-running prepublishOnly per
  // package would push the later publishes past a one-time code's lifetime.
  run(
    'pnpm',
    [
      'publish', '--access', 'public', '--no-git-checks', '--ignore-scripts',
      ...(otp ? [`--otp=${otp}`] : []),
      ...(dryRun ? ['--dry-run'] : []),
    ],
    p.cwd,
  )
}

if (dryRun) {
  step(`dry run complete — would publish: ${todo.map((p) => `${p.name}@${p.version}`).join(', ')}`)
  process.exit(0)
}

// ── Tag ──────────────────────────────────────────────────────────────────────
// One tag per published package — `release:bump` diffs against these.
const tags = todo.map((p) => `${p.name}@${p.version}`).filter((t) => !sh(`git tag --list "${t}"`))
step(`tag and push: ${tags.join(', ')}`)
for (const t of tags) run('git', ['tag', '-a', t, '-m', `release ${t}`])
run('git', ['push', 'origin', 'main', ...tags])

step(`released: ${todo.map((p) => `${p.name}@${p.version}`).join(', ')}`)
console.log('\n  try it:  npx @studiomorgana/cli@latest init my-app')
