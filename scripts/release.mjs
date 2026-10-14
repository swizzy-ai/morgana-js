#!/usr/bin/env node
/**
 * `pnpm release` — publish every @studiomorgana package in one go.
 *
 *   pnpm release             gate, then publish, then tag + push
 *   pnpm release --dry-run   gate, then `pnpm publish --dry-run`; nothing leaves the machine
 *   pnpm release:fast        build only — no typecheck/test. For re-running after a
 *                            gate that already passed (e.g. a 2FA timeout mid-publish)
 *   --otp=123456             one-time code, for an npm account with 2FA on writes
 *                            (or set NPM_OTP; or use a granular token that bypasses 2FA)
 *
 * The Morgana packages release in lockstep: they must all carry the same
 * version, and `morgana init` scaffolds against the CLI's own version.
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
const PACKAGES = ['sdk', 'wizard', 'morgana-agents', 'sdk-compile', 'morgana-cli', 'morgana-eject']

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

const pkgs = PACKAGES.map((dir) => {
  const json = JSON.parse(fs.readFileSync(path.join(root, 'packages', dir, 'package.json'), 'utf8'))
  return { dir, name: json.name, version: json.version, cwd: path.join(root, 'packages', dir) }
})

// ── Preflight ────────────────────────────────────────────────────────────────
step('preflight')

const versions = new Set(pkgs.map((p) => p.version))
if (versions.size !== 1) fail(`versions are not in lockstep: ${pkgs.map((p) => `${p.name}@${p.version}`).join(', ')}`)
const version = pkgs[0].version
console.log(`  version   ${version}`)

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

// ── Gate ─────────────────────────────────────────────────────────────────────
// Only the published packages. Examples are not shipped and do not gate a release.
const filters = pkgs.flatMap((p) => ['--filter', p.name])

step('build')
run('pnpm', [...filters, 'run', 'build'])
if (skipChecks) {
  step('typecheck + test skipped (--skip-checks)')
} else {
  step('typecheck')
  run('pnpm', [...filters, 'run', 'typecheck'])
  step('test')
  run('pnpm', [...filters, 'run', 'test'])
}

// ── Publish ──────────────────────────────────────────────────────────────────
const published = []
for (const p of pkgs) {
  let onNpm = false
  try {
    onNpm = sh(`npm view ${p.name}@${p.version} version`) === p.version
  } catch {
    /* 404 — not published yet */
  }
  if (onNpm) {
    step(`${p.name}@${p.version} already on npm — skipping`)
    continue
  }
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
  published.push(p.name)
}

// ── Tag ──────────────────────────────────────────────────────────────────────
if (dryRun) {
  step(`dry run complete — would publish: ${published.join(', ') || 'nothing'}`)
  process.exit(0)
}

const tag = `v${version}`
if (!sh(`git tag --list ${tag}`)) {
  step(`tag ${tag} and push`)
  run('git', ['tag', '-a', tag, '-m', `release ${tag}`])
  run('git', ['push', 'origin', 'main', tag])
}

step(`released ${version}: ${published.join(', ') || 'nothing new'}`)
console.log('\n  try it:  npx @studiomorgana/cli@latest init my-app')
