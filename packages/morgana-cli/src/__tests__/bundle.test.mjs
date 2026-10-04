/**
 * The bundle is the shipped artifact, and two of its failures are invisible to
 * every other check in this repo.
 *
 * `tsc` reads `src/`, and the unit tests import `src/`. Neither ever loads
 * `dist/morgana.js`, so a bundle that cannot start — wrong externals, a `node:`
 * built-in normalised to a form Node rejects — passes typecheck, passes 35 unit
 * tests, and is published. These tests load the built file the way a user does.
 */
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.resolve(here, '..', '..')
const bundle = path.join(pkgRoot, 'dist', 'morgana.js')

const require_ = createRequire(import.meta.url)

/**
 * Build through tsup's own entry rather than `pnpm exec tsup`.
 *
 * `pnpm` is a shell shim, not an executable, so spawning it from Node fails
 * with ENOENT on Windows — and a test that cannot run on the platform it is
 * developed on is worse than no test.
 */
function build() {
  const pkgJson = path.join(path.dirname(require_.resolve('tsup/package.json')), 'dist', 'cli-default.js')
  execFileSync(process.execPath, [pkgJson], { cwd: pkgRoot, stdio: 'ignore', timeout: 180_000 })
}

function run(args) {
  return execFileSync(process.execPath, [bundle, ...args], {
    encoding: 'utf8',
    timeout: 60_000,
  })
}

describe('the built bundle', () => {
  beforeAll(() => {
    // Built here rather than assumed, so a test run cannot pass against a stale
    // dist from an earlier commit.
    build()
  }, 200_000)

  it('exists where package.json says the bin is', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf8'))
    const bin = path.resolve(pkgRoot, pkg.bin.morgana)
    expect(fs.existsSync(bin), `${pkg.bin.morgana} is missing — run the build`).toBe(true)
  })

  it('starts', () => {
    // Not a snapshot of the whole help text: this asserts the file *loads*, which
    // is the part that a bad import breaks. A top-level `import` of a specifier
    // Node cannot resolve throws here, before a single command is printed.
    expect(run(['--help'])).toContain('morgana')
  })

  it('lists every command', () => {
    const help = run(['--help'])
    for (const name of ['init', 'build', 'dev', 'deploy', 'login', 'logout', 'status']) {
      expect(help, `help does not mention ${name}`).toContain(name)
    }
  })

  it('does not resolve a Node built-in through a bare specifier', () => {
    // Most built-ins are fine bare — `import … from "fs"` works, which is why the
    // normalisation is usually harmless. Four are not: Node exposes `sea`,
    // `sqlite`, `test` and `test/reporters` *only* under the `node:` scheme, so
    // `isBuiltin('sqlite')` is false and a bare specifier is ERR_MODULE_NOT_FOUND
    // at module load — before the CLI prints anything.
    //
    // `src/lib/store.mjs` loads `node:sqlite` through `createRequire` to keep the
    // specifier a runtime string. This asserts it stayed that way, and asks Node
    // which specifiers are affected rather than hardcoding four names that a Node
    // release could add to.
    const { isBuiltin } = require_('node:module')
    const prefixedOnly = require_('node:module').builtinModules
      .filter((m) => m.startsWith('node:'))
      .map((m) => m.slice(5))
      .filter((m) => !isBuiltin(m))

    const emitted = [...fs.readFileSync(bundle, 'utf8').matchAll(/from\s*["']([a-z][a-z0-9/]*)["']/g)]
      .map((m) => m[1])

    const broken = emitted.filter((spec) => prefixedOnly.includes(spec))
    expect(
      broken,
      `bare specifier(s) Node cannot resolve: ${broken.join(', ')}`,
    ).toEqual([])
  })

  it('keeps the three Morgana packages external', () => {
    // `@morgana/sdk-compile` locates the SDK's TypeScript source on disk at
    // runtime, via `import.meta.url` and `fs.existsSync`. Inlining it rewrites
    // `import.meta.url` and those probes find nothing.
    const source = fs.readFileSync(bundle, 'utf8')
    for (const dep of ['@morgana/sdk', '@morgana/sdk-compile', '@morgana/agents']) {
      expect(source, `${dep} was inlined`).toMatch(new RegExp(`from\\s*["']${dep}["']`))
    }
  })

  it('carries a shebang exactly once', () => {
    const source = fs.readFileSync(bundle, 'utf8')
    expect(source.startsWith('#!/usr/bin/env node')).toBe(true)
    expect(source.split('#!/usr/bin/env node').length - 1).toBe(1)
  })
})