/**
 * Server objects — discovery, bundling, end-to-end compile.
 *
 * A server object lives in `src/server-objects/`, is picked up with no
 * registration step, deploys through the existing object pipeline, and each
 * op ships as a self-contained module the sandbox can evalCode with no imports.
 */
import fs from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { discoverServerObjects } from '../server-objects'

const CONFIG = [
  "import { defineConfig } from '@morgana/sdk'",
  'export default defineConfig({',
  "  name: 'so-demo',",
  "  entry: 'home',",
  '})',
].join('\n')

const SEED = [
  "import { defineClientAction } from '@morgana/sdk'",
  'export const seed = defineClientAction({',
  '  config: { on: "compile" },',
  '  handler: (ctx) => {',
  "    ctx.ui.pages.create({ name: 'home', address: '/' })",
  '    return { ok: true }',
  '  },',
  '})',
].join('\n')

const COUNTER = [
  "import { customServerObject } from '@morgana/sdk'",
  'export default customServerObject({',
  "  name: 'counter',",
  '  shape: { columns: [{ name: "count", type: "number" }] },',
  '  ops: {',
  '    get: async (ctx) => ({ count: (ctx.object.state.count as number) ?? 0 }),',
  '    incr: async (ctx, p) => ({ count: ((ctx.object.state.count as number) ?? 0) + Number(p.by ?? 1) }),',
  '  },',
  '})',
].join('\n')

const NAMED = [
  "import { customServerObject } from '@morgana/sdk'",
  'export const ledger = customServerObject({',
  "  name: 'ledger',",
  '  ops: {',
  '    balance: async () => ({ balance: 0 }),',
  '  },',
  '})',
].join('\n')

function writeProject(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(tmpdir(), 'morgana-so-'))
  const write = (rel: string, text: string): void => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    fs.writeFileSync(path.join(dir, rel), text, 'utf8')
  }
  write('morgana.config.ts', CONFIG)
  write('src/actions/compile/seed.ts', SEED)
  for (const [rel, text] of Object.entries(files)) write(rel, text)
  return dir
}

describe('server object discovery', () => {
  it('finds default and named exports with their ops', () => {
    const dir = writeProject({
      'src/server-objects/counter.ts': COUNTER,
      'src/server-objects/ledger.ts': NAMED,
    })
    const decls = discoverServerObjects(dir)
    try {
      expect(decls.map((d) => d.name)).toEqual(['counter', 'ledger'])
      expect(decls.find((d) => d.name === 'counter')?.ops).toEqual(['get', 'incr'])
      expect(decls.find((d) => d.name === 'ledger')?.exportName).toBe('ledger')
      expect(decls.find((d) => d.name === 'counter')?.shape).toEqual({
        columns: [{ name: 'count', type: 'number' }],
      })
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('a helper module with no factory is ignored with a warning, not an error', () => {
    const dir = writeProject({ 'src/server-objects/util.ts': 'export const one = 1\n' })
    const warnings: string[] = []
    try {
      expect(discoverServerObjects(dir, warnings)).toEqual([])
      expect(warnings[0]).toContain('no customServerObject')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('missing name and name collisions fail the build loudly', () => {
    const nameless = writeProject({
      'src/server-objects/x.ts': "export default customServerObject({ ops: { a: async () => 1 } })\n",
    })
    try {
      expect(() => discoverServerObjects(nameless)).toThrow(/has no `name/)
    } finally {
      fs.rmSync(nameless, { recursive: true, force: true })
    }
    const clash = writeProject({
      'src/server-objects/a.ts': COUNTER,
      'src/server-objects/b.ts': COUNTER,
    })
    try {
      expect(() => discoverServerObjects(clash)).toThrow(/both claim the name "counter"/)
    } finally {
      fs.rmSync(clash, { recursive: true, force: true })
    }
  })
})
