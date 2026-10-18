/**
 * Build-time errors name the project file and line that threw.
 *
 * The case that prompted this: a page builder read `.svg` from a table entry
 * that didn't exist yet, and the build said only "Cannot read properties of
 * undefined (reading 'svg')" — no file, no line, so it looked like a compiler
 * fault. The bundles carry a source map now, and the message carries the place.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { compileProject } from '../index'

function project(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(tmpdir(), 'morgana-errors-'))
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    fs.writeFileSync(path.join(dir, rel), text)
  }
  return dir
}

const CONFIG = (extra = '') => `import { defineConfig } from '@studiomorgana/sdk'\nexport default defineConfig({ name: 'e', entry: 'home'${extra} })\n`

describe('build errors say where they happened', () => {
  it('points at the line in a helper file a compile action calls', async () => {
    const dir = project({
      'morgana.config.ts': CONFIG(),
      'src/lib/art.ts': [
        'const ART: Record<string, { svg: string }> = { landing: { svg: "<svg/>" } }',
        '',
        'export function artSrc(id: string): string {',
        '  return ART[id]!.svg',
        '}',
      ].join('\n'),
      'src/actions/compile/home.ts': [
        "import { defineClientAction } from '@studiomorgana/sdk'",
        "import { artSrc } from '../../lib/art'",
        'export const home = defineClientAction({',
        "  config: { on: 'compile' },",
        '  handler: (ctx) => {',
        "    const page = ctx.ui.pages.create({ name: 'home', address: '/' })",
        "    page.place(ctx.ui.image({ id: 'a', src: artSrc('missing'), alt: '' }))",
        '  },',
        '})',
      ].join('\n'),
    })
    await expect(compileProject({ dir })).rejects.toThrow(
      /compile action "home" failed at src\/lib\/art\.ts:4:\d+ — Cannot read properties of undefined \(reading 'svg'\)/,
    )
  })

  it('points at the action file itself when the action throws', async () => {
    const dir = project({
      'morgana.config.ts': CONFIG(),
      'src/actions/compile/home.ts': [
        "import { defineClientAction } from '@studiomorgana/sdk'",
        'export const home = defineClientAction({',
        "  config: { on: 'compile' },",
        '  handler: () => {',
        "    throw new Error('no page today')",
        '  },',
        '})',
      ].join('\n'),
    })
    await expect(compileProject({ dir })).rejects.toThrow(/failed at src\/actions\/compile\/home\.ts:5:\d+ — no page today/)
  })

  it('points into a plugin definition when its build function throws', async () => {
    const dir = project({
      'morgana.config.ts': CONFIG(", plugins: ['./plugins/p.ts']"),
      'plugins/p.ts': [
        "import { definePlugin } from '@studiomorgana/sdk'",
        "export default definePlugin({ name: 'p', about: 'x', reads: 'src/things', defines: ['defineThing'],",
        "  makes: (t, make) => make.file('out', t.name + '.txt', t.build()) })",
      ].join('\n'),
      'src/things/one.ts': [
        "export default {",
        "  name: 'one',",
        '  build: () => {',
        '    const parts: Record<string, { size: number }> = {}',
        "    return String(parts['wheel']!.size)",
        '  },',
        '}',
      ].join('\n'),
    })
    await expect(compileProject({ dir })).rejects.toThrow(/src\/things\/one\.ts: the p plugin failed at src\/things\/one\.ts:5:\d+ — Cannot read properties of undefined/)
  })
})
