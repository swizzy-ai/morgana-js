/**
 * `ctx.channels` is an alias, not a second surface.
 *
 * The two names exist because channels are reached constantly and
 * `ctx.events.channels.create(…)` reads as though the channel belongs to the
 * event system rather than to the project. Pointing both at one object is the
 * whole point: two implementations would mean every method added to one had to be
 * remembered in the other, and a caller using both would get objects that look
 * identical and behave differently.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { compileProject } from '../index'

const CONFIG = [
  "import { defineConfig } from '@morgana/sdk'",
  "export default defineConfig({ name: 'alias', entry: 'home' })",
].join('\n')

const DECLARE = [
  "import { defineClientAction } from '@morgana/sdk'",
  'export const seed = defineClientAction({',
  "  config: { on: 'compile' },",
  '  handler: (ctx) => {',
  "    const p = ctx.ui.pages.create({ name: 'home', address: '/' })",
  '    p.place(ctx.ui.text({ id: "t", content: "hi" }))',
  // Both names, called on the same context.
  '    ctx.channels.create("via-channels")',
  '    ctx.events.channels.create("via-events")',
  '    return { ok: true }',
  '  },',
  '})',
].join('\n')

function project(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'morgana-alias-'))
  fs.mkdirSync(path.join(dir, 'src', 'actions', 'compile'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'morgana.config.ts'), CONFIG, 'utf8')
  fs.writeFileSync(path.join(dir, 'src', 'actions', 'compile', 'seed.ts'), DECLARE, 'utf8')
  return dir
}

describe('ctx.channels and ctx.events.channels', () => {
  it('declare through either name, and land in the same IR', async () => {
    const dir = project()
    try {
      const result = await compileProject({ dir, outDir: path.join(dir, 'dist') })
      const manifest = JSON.parse(
        fs.readFileSync(path.join(dir, 'dist', 'manifest.json'), 'utf8'),
      ) as { channels?: Record<string, unknown> }
      // One channel each, recorded once — not the same name twice from two
      // surfaces, and not one surface quietly missing.
      expect(Object.keys(manifest.channels ?? {}).sort()).toEqual(['via-channels', 'via-events'])
      expect(result.warnings).toEqual([])
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('the compile context hands out one object under both names', async () => {
    const dir = project()
    try {
      const source = fs.readFileSync(
        path.join(__dirname, '..', 'compile-ctx', 'index.ts'),
        'utf8',
      )
      // Both names are assigned from the same local, so identity — not
      // resemblance — is what makes them aliases.
      expect(source).toMatch(/const __channels = buildChannels\(state\)/)
      const aliases = source.match(/channels: __channels,/g) ?? []
      // Twice per context (events.channels and the alias) across both contexts.
      expect(aliases.length).toBeGreaterThanOrEqual(4)
      // And the builder is called once per context, not twice.
      expect(source.match(/buildChannels\(state\)/g)?.length).toBe(2)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
