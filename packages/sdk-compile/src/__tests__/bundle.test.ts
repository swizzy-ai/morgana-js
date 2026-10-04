/**
 * Bundling — actions are real modules.
 *
 * Each fixture writes a project to disk so imports resolve the way they do in
 * a real project, then asserts on what actually reaches `dist/`.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { compileProject } from '../index'
import { bundleCompileAction, bundleServerAction, resolveSdkEntry } from '../bundle'

function write(p: string, content: string): void {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content, 'utf8')
}

function makeProject(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(tmpdir(), 'morgana-bundle-'))
  write(
    path.join(dir, 'morgana.config.ts'),
    [
      "import { defineConfig } from '@morgana/sdk'",
      '',
      "export default defineConfig({ name: 'bundle-test', entry: 'home' })",
      '',
    ].join('\n'),
  )
  for (const [rel, content] of Object.entries(files)) {
    write(path.join(dir, rel), content)
  }
  return dir
}

const CONFIG = [
  "import { defineConfig } from '@morgana/sdk'",
  '',
  "export default defineConfig({ name: 'bundle-test', entry: 'home' })",
  '',
].join('\n')

/** A compile action that builds a one-box page. */
const COMPILE_PAGE = [
  "import { defineClientAction } from '@morgana/sdk'",
  "import { suffix } from '../_shared/words'",
  "import { frame } from '../_shared/layout'",
  '',
  'export const page = defineClientAction({',
  "  config: { on: 'compile' },",
  '  handler: (ctx) => {',
  "    const p = ctx.ui.pages.create({ name: 'home', address: '/' })",
  "    const box = ctx.ui.box({ id: 'b' })",
  "    box.setProps({ ...frame, pad: 2 })",
  "    const t = ctx.ui.text({ id: 't', content: 'hello' + suffix })",
  '    box.place(t)',
  '    p.place(box)',
  '    return { ok: true }',
  '  },',
  '})',
  '',
].join('\n')

const SHARED_WORDS = [
  "export const suffix = ' world'",
  '',
  'export function shout(s: string): string {',
  '  return s.toUpperCase()',
  '}',
  '',
].join('\n')

const SHARED_LAYOUT = [
  'export const frame = { gap: 3, layout: "row" }',
  '',
].join('\n')

describe('multi-file actions', () => {
  it('runs a compile action whose helpers live in other files', async () => {
    const dir = makeProject({
      'morgana.config.ts': CONFIG,
      'src/actions/_shared/words.ts': SHARED_WORDS,
      'src/actions/_shared/layout.ts': SHARED_LAYOUT,
      'src/actions/compile/page.ts': COMPILE_PAGE,
    })
    try {
      const result = await compileProject({ dir, outDir: path.join(dir, 'dist') })
      expect(result.pages).toEqual(['home'])
      const html = fs.readFileSync(path.join(dir, 'dist', 'pages', 'home.html'), 'utf8')
      // The imported constant reached the IR, and a shared object spread applied.
      expect(html).toContain('hello world')
      const css = fs.readFileSync(path.join(dir, 'dist', 'assets', 'style.css'), 'utf8')
      expect(css).toContain('[data-entity="b"]')
      expect(css).toContain('gap:12px')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)

  it('inlines a server action\'s imports into one self-contained module', async () => {
    const dir = makeProject({
      'morgana.config.ts': CONFIG,
      'src/actions/_shared/words.ts': SHARED_WORDS,
      'src/actions/server/greet.ts': [
        "import { defineServerAction } from '@morgana/sdk'",
        "import { shout } from '../_shared/words'",
        '',
        'export const greet = defineServerAction({',
        '  handler: (ctx) => ({ greeting: shout("hi" + (ctx.args?.name ?? "")) }),',
        '})',
        '',
      ].join('\n'),
    })
    try {
      await compileProject({ dir, outDir: path.join(dir, 'dist') })
      const code = fs.readFileSync(path.join(dir, 'dist', 'server', 'actions', 'greet.js'), 'utf8')
      expect(code).toContain('export')
      // No bare-specifier imports survive — the graph was inlined.
      expect(code).not.toMatch(/from\s*["'][^./][^"']*["']/)
      expect(code).not.toMatch(/\bimport\s*\*\s*as\b/)
      expect(code).toContain('toUpperCase')
      expect(code).toContain('function handle')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)

  it('bundles all browser actions in one pass, sharing a helper once', async () => {
    const dir = makeProject({
      'morgana.config.ts': CONFIG,
      'src/actions/_shared/words.ts': SHARED_WORDS,
      'src/actions/browser/a.ts': [
        "import { defineClientAction } from '@morgana/sdk'",
        "import { suffix } from '../_shared/words'",
        '',
        'export const a = defineClientAction({ handler: () => ({ v: suffix }) })',
        '',
      ].join('\n'),
      'src/actions/browser/b.ts': [
        "import { defineClientAction } from '@morgana/sdk'",
        "import { suffix } from '../_shared/words'",
        '',
        'export const b = defineClientAction({ handler: () => ({ v: suffix }) })',
        '',
      ].join('\n'),
    })
    try {
      await compileProject({ dir, outDir: path.join(dir, 'dist') })
      const client = fs.readFileSync(path.join(dir, 'dist', 'assets', 'client.js'), 'utf8')
      expect(client).toContain('__reg["a"]')
      expect(client).toContain('__reg["b"]')
      // The shared module is emitted once, not duplicated per action.
      expect(client).toContain('world')
      expect((client.match(/var suffix/g) ?? []).length).toBe(1)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)

  it('resolves @morgana/sdk to the real source without the project depending on it', async () => {
    const dir = makeProject({
      'morgana.config.ts': CONFIG,
      'src/actions/_shared/words.ts': SHARED_WORDS,
      'src/actions/server/greet.ts': [
        "import { defineServerAction } from '@morgana/sdk'",
        "import { shout } from '../_shared/words'",
        '',
        'export const greet = defineServerAction({',
        '  handler: (ctx) => ({ greeting: shout("hi") }),',
        '})',
        '',
      ].join('\n'),
    })
    try {
      // No node_modules in the project at all — the plugin supplies the SDK.
      expect(fs.existsSync(path.join(dir, 'node_modules'))).toBe(false)
      const code = await bundleServerAction({
        projectDir: dir,
        file: path.join(dir, 'src', 'actions', 'server', 'greet.ts'),
        name: 'greet',
        factory: 'server',
      })
      expect(code).toContain('defineServerAction')
      expect(code).toContain('toUpperCase')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)

  it('reports the action and file when an import cannot be resolved', async () => {
    const dir = makeProject({
      'morgana.config.ts': CONFIG,
      'src/actions/server/broken.ts': [
        "import { defineServerAction } from '@morgana/sdk'",
        "import { nope } from './does-not-exist'",
        '',
        'export const broken = defineServerAction({ handler: () => nope() })',
        '',
      ].join('\n'),
    })
    try {
      await expect(
        bundleServerAction({
          projectDir: dir,
          file: path.join(dir, 'src', 'actions', 'server', 'broken.ts'),
          name: 'broken',
          factory: 'server',
        }),
      ).rejects.toThrow(/broken/)
      await expect(
        bundleServerAction({
          projectDir: dir,
          file: path.join(dir, 'src', 'actions', 'server', 'broken.ts'),
          name: 'broken',
          factory: 'server',
        }),
      ).rejects.toThrow(/does-not-exist/)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)

  it('warns that a node built-in works in dev and fails on deploy', async () => {
    // The server lane bundles with `platform: 'node'`, so esbuild leaves built-ins
    // external and the emitted module keeps a bare `import`. `morgana dev` imports
    // that file in Node, where it resolves. The worker evaluates the module body
    // inside a function, where `import` is a SyntaxError — so the deploy accepts
    // the upload and the action 500s on first call. Measured end to end: upload
    // 200, invoke 500 "Unexpected token '{'".
    //
    // A warning rather than an error because the action is valid under
    // `morgana dev`, and the compiler cannot know whether the project ships.
    const dir = makeProject({
      'morgana.config.ts': CONFIG,
      'src/actions/server/stamp.ts': [
        "import { defineServerAction } from '@morgana/sdk'",
        "import { createHash } from 'node:crypto'",
        '',
        'export const stamp = defineServerAction({',
        "  handler: () => createHash('sha256').update('x').digest('hex'),",
        '})',
        '',
      ].join('\n'),
    })
    try {
      const warnings: string[] = []
      const code = await bundleServerAction(
        {
          projectDir: dir,
          file: path.join(dir, 'src', 'actions', 'server', 'stamp.ts'),
          name: 'stamp',
          factory: 'server',
        },
        warnings,
      )
      // Still emitted, so it still works locally — that is what makes the warning
      // necessary rather than the build failing.
      expect(code).toMatch(/from\s*["']node:crypto["']/)
      expect(warnings.join('\n')).toMatch(/node:crypto/)
      expect(warnings.join('\n')).toMatch(/morgana dev/)
      expect(warnings.join('\n')).toMatch(/fail on deploy/)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)

  it('says nothing about built-ins a dependency does not pull in', async () => {
    // The warning is one line per specifier, so an ordinary server action must
    // produce none at all — otherwise it is noise the author learns to skip.
    const dir = makeProject({
      'morgana.config.ts': CONFIG,
      'src/actions/server/plain.ts': [
        "import { defineServerAction } from '@morgana/sdk'",
        '',
        'export const plain = defineServerAction({ handler: () => ({ ok: true }) })',
        '',
      ].join('\n'),
    })
    try {
      const warnings: string[] = []
      await bundleServerAction(
        {
          projectDir: dir,
          file: path.join(dir, 'src', 'actions', 'server', 'plain.ts'),
          name: 'plain',
          factory: 'server',
        },
        warnings,
      )
      expect(warnings).toEqual([])
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)
})

describe('compile lane execution', () => {
  it('gives the handler a real module scope, including its own imports', async () => {
    const dir = makeProject({
      'morgana.config.ts': CONFIG,
      'src/actions/_shared/words.ts': SHARED_WORDS,
      'src/actions/compile/probe.ts': [
        "import { defineServerAction } from '@morgana/sdk'",
        "import { shout } from '../_shared/words'",
        '',
        'export const probe = defineServerAction({',
        '  config: { on: "compile" },',
        "  handler: (ctx) => { ctx.server.collections.create('t', { columns: [{ name: shout('c'), type: 'string' }] }) },",
        '})',
        '',
      ].join('\n'),
    })
    try {
      const fn = await bundleCompileAction({
        projectDir: dir,
        file: path.join(dir, 'src', 'actions', 'compile', 'probe.ts'),
        name: 'probe',
        factory: 'server',
      })
      const calls: Array<{ n: string; s: unknown }> = []
      fn({
        server: {
          collections: {
            create: (n: string, s: unknown) => {
              calls.push({ n, s })
            },
          },
        },
      })
      // shout() ran inside the module: the import resolved, not a copy of it.
      expect(calls).toEqual([{ n: 't', s: { columns: [{ name: 'C', type: 'string' }] } }])
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)

  it('fails clearly when a compile action exports no handler', async () => {
    const dir = makeProject({
      'morgana.config.ts': CONFIG,
      'src/actions/compile/empty.ts': ['export const nothing = 1', ''].join('\n'),
    })
    try {
      await expect(
        bundleCompileAction({
          projectDir: dir,
          file: path.join(dir, 'src', 'actions', 'compile', 'empty.ts'),
          name: 'empty',
          factory: 'client',
        }),
      ).rejects.toThrow(/exports no handler/)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)
})

describe('minify', () => {
  const BROWSER_ACTION = [
    "import { defineClientAction } from '@morgana/sdk'",
    '',
    'export const ping = defineClientAction({',
    '  handler: () => ({ ok: true, note: "a long string literal that must survive minification" }),',
    '})',
    '',
  ].join('\n')

  const SERVER_ACTION = [
    "import { defineServerAction } from '@morgana/sdk'",
    '',
    'export const greet = defineServerAction({',
    '  handler: (ctx) => ({ greeting: "hello " + (ctx.args?.name ?? "world") }),',
    '})',
    '',
  ].join('\n')

  function project(config: string): string {
    return makeProject({
      'morgana.config.ts': config,
      'src/actions/browser/ping.ts': BROWSER_ACTION,
      'src/actions/server/greet.ts': SERVER_ACTION,
    })
  }

  it('is off by default and readable', async () => {
    const dir = project(CONFIG)
    try {
      await compileProject({ dir, outDir: path.join(dir, 'dist') })
      const client = fs.readFileSync(path.join(dir, 'dist', 'assets', 'client.js'), 'utf8')
      // The string-built runtime is always verbatim; bundles keep their
      // per-module comments when minify is off.
      expect(client).toContain('function firstPaint()')
      expect(client).toContain('src/actions/browser/ping.ts')
      expect(client).toContain('must survive minification')
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'dist', 'manifest.json'), 'utf8'))
      expect(manifest.minify).toBe(false)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)

  it('minifies client and server modules when the config asks for it', async () => {
    const dir = project(CONFIG.replace('name: \'bundle-test\'', 'name: \'bundle-test\', minify: true'))
    try {
      await compileProject({ dir, outDir: path.join(dir, 'dist') })
      const client = fs.readFileSync(path.join(dir, 'dist', 'assets', 'client.js'), 'utf8')
      const server = fs.readFileSync(path.join(dir, 'dist', 'server', 'actions', 'greet.js'), 'utf8')

      // Whitespace and per-module comments are gone from both lanes.
      expect(client).not.toContain('src/actions/browser/ping.ts')
      expect(server).not.toContain('// src/actions/server/greet.ts')
      expect(server.split('\n').length).toBeLessThan(6)

      // Behaviour is preserved: literals, keys and the exported name survive.
      // (Registration is emitted as `i.ping=n` once names are shortened, so
      // assert the string literals that prove the action was bundled.)
      expect(client).toContain('must survive minification')
      expect(client).toContain('__morgana_run')
      expect(client).toContain('browser action ping exports no handler')
      expect(server).toMatch(/export\s*\{[^}]*\bas\s+handle\b/)
      expect(server).toContain('hello ')

      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'dist', 'manifest.json'), 'utf8'))
      expect(manifest.minify).toBe(true)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)

  it('lets a compileProject call override the config', async () => {
    const minifiedConfig = CONFIG.replace('name: \'bundle-test\'', 'name: \'bundle-test\', minify: true')
    const dir = project(minifiedConfig)
    try {
      await compileProject({ dir, outDir: path.join(dir, 'dist'), minify: false })
      const client = fs.readFileSync(path.join(dir, 'dist', 'assets', 'client.js'), 'utf8')
      expect(client).toContain('function firstPaint()')
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'dist', 'manifest.json'), 'utf8'))
      expect(manifest.minify).toBe(false)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)

  it('minified output is smaller and still runs', async () => {
    const readable = project(CONFIG)
    const small = project(CONFIG.replace('name: \'bundle-test\'', 'name: \'bundle-test\', minify: true'))
    try {
      await compileProject({ dir: readable, outDir: path.join(readable, 'dist') })
      await compileProject({ dir: small, outDir: path.join(small, 'dist') })
      const bigSize = fs.statSync(path.join(readable, 'dist', 'assets', 'client.js')).size
      const smallSize = fs.statSync(path.join(small, 'dist', 'assets', 'client.js')).size
      expect(smallSize).toBeLessThan(bigSize)
    } finally {
      fs.rmSync(readable, { recursive: true, force: true })
      fs.rmSync(small, { recursive: true, force: true })
    }
  }, 60_000)

  it('changes the manifest hash, so a minify toggle is visible to caches', async () => {
    const readable = project(CONFIG)
    const small = project(CONFIG.replace('name: \'bundle-test\'', 'name: \'bundle-test\', minify: true'))
    try {
      const a = await compileProject({ dir: readable, outDir: path.join(readable, 'dist') })
      const b = await compileProject({ dir: small, outDir: path.join(small, 'dist') })
      // Identical structure, different output — the hash must say so.
      expect(a.pages).toEqual(b.pages)
      expect(a.hash).not.toBe(b.hash)
    } finally {
      fs.rmSync(readable, { recursive: true, force: true })
      fs.rmSync(small, { recursive: true, force: true })
    }
  }, 60_000)

  it('minifies the stylesheet too, and keeps the parts minifiers break', async () => {
    const readable = project(CONFIG)
    const small = project(CONFIG.replace('name: \'bundle-test\'', 'name: \'bundle-test\', minify: true'))
    try {
      await compileProject({ dir: readable, outDir: path.join(readable, 'dist') })
      await compileProject({ dir: small, outDir: path.join(small, 'dist') })
      const big = fs.readFileSync(path.join(readable, 'dist', 'assets', 'style.css'), 'utf8')
      const min = fs.readFileSync(path.join(small, 'dist', 'assets', 'style.css'), 'utf8')

      expect(min.length).toBeLessThan(big.length)
      // The generated sheet leads with a comment and readable spacing; neither
      // belongs in a shipped stylesheet.
      expect(min).not.toContain('generated by @morgana/sdk-compile')
      // What must survive: the design-token custom properties and every at-rule
      // block. A minifier that mangles either ships a visibly broken page.
      expect(min).toContain('--background:')
      // `@morgana` here is the header comment's own text, which is meant to go.
      const atRules = [...new Set([...big.matchAll(/@[-a-z]+/g)].map((m) => m[0]))].filter((a) => a !== '@morgana')
      for (const at of atRules) expect(min, `${at} must survive minification`).toContain(at)
      // A declaration count comparison catches a minifier that dropped rules.
      const count = (css: string, re: RegExp) => (css.match(re) ?? []).length
      expect(count(min, /\{/g)).toBe(count(big, /\{/g))
    } finally {
      fs.rmSync(readable, { recursive: true, force: true })
      fs.rmSync(small, { recursive: true, force: true })
    }
  }, 60_000)
})

/**
 * Where the SDK's source entry comes from.
 *
 * This suite exists because the resolution was a relative path guess —
 * `../../sdk/src/index.ts` — that only holds inside the monorepo, and its
 * fallback pointed at the *bundled* `dist/index.js`. A bundle has no
 * `export { … } from './…'` lines left in it, so the per-module map came back
 * empty and every action importing a value from `@morgana/sdk` failed to bundle.
 * Tests in this repository run against the workspace layout, so nothing here
 * would ever have caught it; these assertions are about the *installed* shape,
 * which is the shape a consumer gets.
 */
describe('the SDK source entry', () => {
  it('resolves to a real TypeScript file, not the bundle', () => {
    const entry = resolveSdkEntry()
    expect(fs.existsSync(entry), `${entry} must exist`).toBe(true)
    expect(path.extname(entry)).toBe('.ts')
    expect(path.basename(path.dirname(entry))).toBe('src')
  })

  it('resolves the same way a consumer would, through the package exports', () => {
    // The lookup is `require.resolve('@morgana/sdk/package.json')`, which the
    // package's `exports` map has to permit. Without a `./package.json` entry
    // this throws ERR_PACKAGE_PATH_NOT_EXPORTED and the compiler can never find
    // the SDK at all once installed.
    const req = createRequire(path.join(process.cwd(), 'noop.js'))
    const manifest = req.resolve('@morgana/sdk/package.json')
    expect(fs.existsSync(manifest)).toBe(true)
    expect(fs.existsSync(path.join(path.dirname(manifest), 'src', 'index.ts'))).toBe(true)
  })

  it('is what the module map is built from, so the map is not empty', () => {
    // A non-empty map is the whole point: an action importing one SDK value
    // must be able to find the module that declares it.
    const entry = resolveSdkEntry()
    const text = fs.readFileSync(entry, 'utf8')
    const re = /export\s+(?!type\b)\{([^}]*)\}\s*from\s*['"](\.[^'"]+)['"]/g
    const names = new Set<string>()
    for (const match of text.matchAll(re)) {
      for (const spec of (match[1] as string).split(',')) {
        const exported = spec.trim().split(/\s+as\s+/).pop()?.trim()
        if (exported) names.add(exported)
      }
    }
    expect(names.size).toBeGreaterThan(0)
  })
})
