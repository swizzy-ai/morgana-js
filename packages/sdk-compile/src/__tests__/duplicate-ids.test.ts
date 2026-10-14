/**
 * Duplicate-id guard — ids are project-global.
 *
 * The gap this locks in: creating `d-nav-home` in 9 pages made ONE object
 * that silently migrated to the last rail (docs nav rendered on stream
 * only). Explicit-id collisions now fail fast naming both claimants.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { compileProject } from '../index'

function fixture(second: string): string {
  const dir = fs.mkdtempSync(path.join(tmpdir(), 'morgana-dup-'))
  const write = (rel: string, text: string): void => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    fs.writeFileSync(path.join(dir, rel), text, 'utf8')
  }
  write(
    'morgana.config.ts',
    [
      "import { defineConfig } from '@studiomorgana/sdk'",
      "export default defineConfig({ name: 'dup', entry: 'home', hooks: [{ on: 'compile', run: ['a', 'b'] }] })",
    ].join('\n'),
  )
  const action = (name: string, body: string): string =>
    [
      "import { defineClientAction } from '@studiomorgana/sdk'",
      `export const ${name} = defineClientAction({`,
      '  config: { on: "compile" },',
      '  handler: (ctx) => {',
      `    ${body}`,
      '    return { ok: true }',
      '  },',
      '})',
    ].join('\n')
  write(
    'src/actions/compile/a.ts',
    action('a', "const p = ctx.ui.pages.create({ name: 'home', address: '/' }); p.app('main'); p.place(ctx.ui.box({ id: 'shared' }))"),
  )
  write('src/actions/compile/b.ts', action('b', second))
  return dir
}

describe('duplicate object ids', () => {
  it('rejects an explicit id claimed by two actions', async () => {
    const dir = fixture("ctx.ui.pages.create({ name: 'other', address: '/o' }); ctx.ui.box({ id: 'shared' })")
    await expect(compileProject({ dir, outDir: path.join(dir, 'dist') })).rejects.toThrow(/duplicate object id "shared"/)
  })

  it('accepts distinct ids across actions', async () => {
    const dir = fixture("ctx.ui.pages.create({ name: 'other', address: '/o' }); ctx.ui.box({ id: 'other-box' })")
    await compileProject({ dir, outDir: path.join(dir, 'dist') })
    expect(fs.existsSync(path.join(dir, 'dist', 'pages', 'home.html'))).toBe(true)
  })
})
