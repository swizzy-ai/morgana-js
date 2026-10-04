import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { generateRegistry, renderRegistryDts, resolveActionsDirs } from '../generator'

function makeFixtureProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'morgana-registry-'))

  // Server action with an interface Contract — the FRAMEWORK §6 example.
  mkdirSync(path.join(dir, 'actions', 'server'), { recursive: true })
  writeFileSync(
    path.join(dir, 'actions', 'server', 'commitTurn.ts'),
    [
      "import type { ServerContext } from '@morgana/sdk'",
      '',
      'export interface Contract {',
      '  input: { sessionId: string; userContent: string; assistantContent: string }',
      '  output: { ok: boolean }',
      '}',
      '',
      'export async function handle(ctx: ServerContext<Contract>) {',
      '  return { ok: true }',
      '}',
    ].join('\n'),
  )

  // Browser action with a type-alias Contract + optional member.
  mkdirSync(path.join(dir, 'src', 'actions', 'browser'), { recursive: true })
  writeFileSync(
    path.join(dir, 'src', 'actions', 'browser', 'chatUI.ts'),
    [
      "import type { ClientContext } from '@morgana/sdk'",
      '',
      'export type Contract = {',
      '  input: { question?: string }',
      '  output: { ok: boolean }',
      '}',
      '',
      'export async function handle(ctx: ClientContext, params: Contract["input"]) {',
      '  return { ok: true }',
      '}',
    ].join('\n'),
  )

  // Legacy untyped action — no Contract export.
  writeFileSync(
    path.join(dir, 'actions', 'server', 'legacy.ts'),
    ['export async function handle(ctx: unknown) {', '  return { ok: true }', '}'].join('\n'),
  )

  return dir
}

describe('registry generator', () => {
  it('discovers both src/actions and actions roots', () => {
    const dir = makeFixtureProject()
    try {
      const dirs = resolveActionsDirs({ dir })
      expect(dirs).toHaveLength(2)
      expect(dirs.some((d) => d.endsWith(path.join('src', 'actions')))).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it(
    'emits typed entries, skips untyped actions, and is idempotent',
    () => {
    const dir = makeFixtureProject()
    try {
      const result = generateRegistry({ dir })

      expect(result.outPath).toBe(path.join(dir, '.morgana', 'types', 'registry.d.ts'))
      expect(result.scanned).toBe(3)
      expect(result.entries.map((e) => e.name)).toEqual(['chatUI', 'commitTurn'])
      expect(result.untyped).toEqual(['legacy'])

      const dts = readFileSync(result.outPath!, 'utf8')
      expect(dts).toContain(
        'commitTurn: ActionContract<{ sessionId: string; userContent: string; assistantContent: string; }, { ok: boolean; }>',
      )
      expect(dts).toContain('chatUI: ActionContract<{ question?: string | undefined; }, { ok: boolean; }>')
      expect(dts).not.toContain('legacy')
      expect(dts).toContain("import type { ActionContract } from '@morgana/sdk'")
      expect(dts).toContain('interface AppEvents {}')

      // Second run — same output, same file.
      const again = generateRegistry({ dir })
      expect(again.dts).toBe(dts)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  },
  120_000,
)

  it('writes an empty registry when no action dirs exist', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'morgana-registry-empty-'))
    try {
      const result = generateRegistry({ dir })
      expect(result.entries).toHaveLength(0)
      expect(result.scanned).toBe(0)
      const dts = readFileSync(result.outPath!, 'utf8')
      expect(dts).toContain('interface ActionsRegistry {')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('renders unknown members for contracts missing input/output', () => {
    const dts = renderRegistryDts([{ name: 'odd', file: 'odd.ts', lane: 'action' }], new Map())
    expect(dts).toContain('odd: ActionContract<unknown, unknown>')
  })
})
