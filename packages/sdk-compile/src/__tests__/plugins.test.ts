/**
 * Plugins — a project lists a plugin, drops definitions in its folder, and
 * gets files it can point at by name. These pin the parts that make the
 * feature trustworthy: outputs are cached by content (a second build makes
 * nothing), a change rebuilds only what changed, references in pages resolve,
 * and mistakes come back as sentences that name the file.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { compileProject } from '../index'

/** A tiny plugin: each "badge" definition becomes an SVG, one per colour variant. */
const BADGE_PLUGIN = `
import { definePlugin } from '@studiomorgana/sdk'
export default definePlugin({
  name: 'badges',
  about: 'Round badges with a word on them.',
  reads: 'src/badges',
  defines: ['defineBadge'],
  refers: 'badge',
  variants: (b) => Object.keys(b.colours ?? { default: '#888' }),
  makes: (b, make) => {
    const colour = (b.colours ?? { default: '#888' })[make.variant]
    if (!b.word) make.fail('a badge needs a word')
    make.file('image', b.name + '.svg', '<svg xmlns="http://www.w3.org/2000/svg"><circle r="10" fill="' + colour + '"/><text>' + b.word + '</text></svg>')
    make.file('data', b.name + '.json', JSON.stringify({ word: b.word, roll: Math.round(make.random() * 1000) }))
    make.describe({ colour })
  },
})
`

/** A second plugin that reads the first one's outputs. */
const SHELF_PLUGIN = `
import { definePlugin } from '@studiomorgana/sdk'
export default definePlugin({
  name: 'shelves',
  about: 'Shelves of badges.',
  reads: 'src/shelves',
  defines: ['defineShelf'],
  after: ['badges'],
  makes: (s, make) => {
    const urls = s.badges.map((ref) => make.use(ref)?.files.image ?? make.fail('no badge ' + ref))
    make.file('list', s.name + '.txt', urls.join('\\n'))
  },
})
`

const PAGE = `
import { defineClientAction } from '@studiomorgana/sdk'
export const home = defineClientAction({
  config: { on: 'compile' },
  handler: (ctx) => {
    const page = ctx.ui.pages.create({ name: 'home', address: '/' })
    page.place(ctx.ui.image({ id: 'hello-badge', src: 'badge:hello@red', alt: 'hello' }))
    page.place(ctx.ui.image({ id: 'plain', src: 'https://example.com/x.png', alt: 'x' }))
    return { ok: true }
  },
})
`

function project(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(tmpdir(), 'morgana-plugins-'))
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    fs.writeFileSync(path.join(dir, rel), text)
  }
  return dir
}

const config = (plugins: string[]) => [
  "import { defineConfig } from '@studiomorgana/sdk'",
  `export default defineConfig({ name: 'p', entry: 'home', plugins: ${JSON.stringify(plugins)} })`,
].join('\n')

const HELLO = `export default { name: 'hello', word: 'hi', colours: { red: '#e00', blue: '#00e' } }`

describe('plugins', () => {
  it('builds each variant, ships the files and resolves references in pages', async () => {
    const dir = project({
      'morgana.config.ts': config(['./plugins/badges.ts']),
      'plugins/badges.ts': BADGE_PLUGIN,
      'src/badges/hello.ts': HELLO,
      'src/actions/compile/home.ts': PAGE,
    })
    const result = await compileProject({ dir })

    expect(result.artifacts?.map((a) => `${a.name}@${a.variant}`)).toEqual(['hello@red', 'hello@blue'])
    expect(result.artifactsBuilt).toBe(2)
    const red = result.artifacts!.find((a) => a.variant === 'red')!
    expect(red.meta).toEqual({ colour: '#e00' })
    expect(Object.keys(red.files)).toEqual(['image', 'data'])
    expect(red.files.image).toMatch(/^\/assets\/_artifacts\/badges\/[0-9a-f]{12}\/hello\.svg$/)

    // The files and the manifest are in dist/assets, so they deploy with the project.
    const onDisk = path.join(dir, 'dist', red.files.image.replace(/^\//, ''))
    expect(fs.readFileSync(onDisk, 'utf8')).toContain('fill="#e00"')
    expect(fs.existsSync(path.join(dir, 'dist', 'assets', '_artifacts', 'manifest.json'))).toBe(true)

    // The page points at the built file; an ordinary URL is untouched.
    expect(result.ir.objects.get('hello-badge')!.props['src']).toBe(red.files.image)
    expect(result.ir.objects.get('plain')!.props['src']).toBe('https://example.com/x.png')
  })

  it('takes unchanged artifacts from the cache and rebuilds only what changed', async () => {
    const dir = project({
      'morgana.config.ts': config(['./plugins/badges.ts']),
      'plugins/badges.ts': BADGE_PLUGIN,
      'src/badges/hello.ts': HELLO,
      'src/badges/bye.ts': `export default { name: 'bye', word: 'ciao' }`,
    })
    const first = await compileProject({ dir })
    expect(first.artifactsBuilt).toBe(3)

    const second = await compileProject({ dir })
    expect(second.artifactsBuilt).toBe(0)
    expect(second.artifacts!.map((a) => a.hash)).toEqual(first.artifacts!.map((a) => a.hash))

    fs.writeFileSync(path.join(dir, 'src/badges/bye.ts'), `export default { name: 'bye', word: 'adios' }`)
    const third = await compileProject({ dir })
    expect(third.artifactsBuilt).toBe(1)

    const forced = await compileProject({ dir, rebuildArtifacts: true })
    expect(forced.artifactsBuilt).toBe(3)
  })

  it('is deterministic: seeded randomness gives the same bytes on a fresh machine', async () => {
    const files = {
      'morgana.config.ts': config(['./plugins/badges.ts']),
      'plugins/badges.ts': BADGE_PLUGIN,
      'src/badges/hello.ts': HELLO,
    }
    const a = await compileProject({ dir: project(files) })
    const b = await compileProject({ dir: project(files) })
    const read = (outDir: string, url: string) => fs.readFileSync(path.join(outDir, url.replace(/^\//, '')), 'utf8')
    expect(a.artifacts!.map((x) => x.hash)).toEqual(b.artifacts!.map((x) => x.hash))
    expect(read(a.outDir, a.artifacts![0].files.data)).toBe(read(b.outDir, b.artifacts![0].files.data))
  })

  it('builds a plugin after the plugins it reads, whatever order the config lists them in', async () => {
    const dir = project({
      'morgana.config.ts': config(['./plugins/shelves.ts', './plugins/badges.ts']),
      'plugins/badges.ts': BADGE_PLUGIN,
      'plugins/shelves.ts': SHELF_PLUGIN,
      'src/badges/hello.ts': HELLO,
      'src/shelves/top.ts': `export default { name: 'top', badges: ['badge:hello@blue'] }`,
    })
    const result = await compileProject({ dir })
    const shelf = result.artifacts!.find((a) => a.plugin === 'shelves')!
    const blue = result.artifacts!.find((a) => a.variant === 'blue')!
    expect(fs.readFileSync(path.join(dir, 'dist', shelf.files.list.replace(/^\//, '')), 'utf8')).toBe(blue.files.image)
  })

  it('says what went wrong, and where, in plain words', async () => {
    const failing = project({
      'morgana.config.ts': config(['./plugins/badges.ts']),
      'plugins/badges.ts': BADGE_PLUGIN,
      'src/badges/blank.ts': `export default { name: 'blank' }`,
    })
    await expect(compileProject({ dir: failing })).rejects.toThrow('src/badges/blank.ts: a badge needs a word')

    const missing = project({ 'morgana.config.ts': config(['@studiomorgana/not-a-plugin']) })
    await expect(compileProject({ dir: missing })).rejects.toThrow('plugin "@studiomorgana/not-a-plugin" is not installed')

    const orphan = project({ 'morgana.config.ts': config(['./plugins/shelves.ts']), 'plugins/shelves.ts': SHELF_PLUGIN })
    await expect(compileProject({ dir: orphan })).rejects.toThrow('plugin "shelves" builds after "badges", which isn\'t installed')

    const twice = project({
      'morgana.config.ts': config(['./plugins/badges.ts']),
      'plugins/badges.ts': BADGE_PLUGIN,
      'src/badges/a.ts': HELLO,
      'src/badges/b.ts': HELLO,
    })
    await expect(compileProject({ dir: twice })).rejects.toThrow('"hello" (red) is already defined in src/badges/a.ts')
  })

  it('warns when a page points at something no plugin built', async () => {
    const dir = project({
      'morgana.config.ts': config(['./plugins/badges.ts']),
      'plugins/badges.ts': BADGE_PLUGIN,
      'src/badges/hello.ts': HELLO,
      'src/actions/compile/home.ts': PAGE.replace('badge:hello@red', 'badge:nobody'),
    })
    const result = await compileProject({ dir })
    expect(result.warnings).toContain('hello-badge.src: "badge:nobody" names nothing that was built')
  })

  it('leaves a project with no plugins exactly as it was', async () => {
    const dir = project({
      'morgana.config.ts': config([]),
      'src/actions/compile/home.ts': PAGE,
    })
    const result = await compileProject({ dir })
    expect(result.artifacts).toBeUndefined()
    expect(fs.existsSync(path.join(dir, '.morgana', 'artifacts'))).toBe(false)
    expect(result.ir.objects.get('hello-badge')!.props['src']).toBe('badge:hello@red')
  })
})
