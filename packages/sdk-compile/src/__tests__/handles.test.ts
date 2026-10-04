/**
 * Typed-handle surface guard.
 *
 * The gap this locks in: every kind got the same `makeObject()` literal, so
 * `DialogHandle.open`, `FormHandle.getValues`, `TableHandle.sort` and the rest
 * of the typed surface in `sdk/handles.ts` did not exist — a browser action
 * calling one got "is not a function".
 *
 * This asserts the methods are present and callable on a real compiled page.
 * Behaviour is covered by the compiler tests for each kind's renderer and the
 * `behaviors` suites; this file is specifically about surface existence, so a
 * future refactor that drops a method fails here rather than in someone's app.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { compileProject } from '../index'

/** The typed methods `sdk/handles.ts` declares, per kind. */
const EXPECTED: Record<string, string[]> = {
  button: ['disable', 'enable', 'setLoading', 'click'],
  input: ['clear', 'focus', 'blur', 'validate', 'setError'],
  textarea: ['clear', 'focus', 'blur', 'validate', 'setError'],
  select: ['select', 'deselect', 'clear', 'setOptions', 'open', 'close', 'toggle', 'getValue'],
  switch: ['toggle', 'check', 'uncheck', 'isChecked', 'setLabel'],
  checkbox: ['toggle', 'check', 'uncheck', 'isChecked', 'setLabel'],
  radio: ['toggle', 'check', 'uncheck', 'isChecked', 'setLabel'],
  toggle: ['toggle', 'check', 'uncheck', 'isChecked', 'setLabel'],
  dialog: ['open', 'close', 'toggle', 'confirm', 'cancel', 'dismiss', 'setTitle', 'setDescription', 'isOpen'],
  tabs: ['setActive', 'next', 'prev', 'getActive', 'getActiveKey', 'setItems'],
  accordion: ['open', 'close', 'toggle', 'isOpen', 'keys'],
  dropdown: ['open', 'close', 'toggle', 'isOpen'],
  menu: ['open', 'close', 'toggle', 'isOpen', 'selectItem'],
  badge: ['setLabel', 'setVariant', 'remove'],
  alert: ['show', 'hide', 'isVisible', 'setVariant', 'setMessage'],
  progress: ['setValue', 'setProgress', 'getValue', 'increment', 'decrement', 'reset'],
  avatar: ['setSrc', 'setName', 'setStatus'],
  label: ['setLabel', 'setFor'],
  form: [
    'getValue', 'setValue', 'getField', 'setField', 'setValues', 'getValues',
    'setError', 'getError', 'clearError', 'clearAllErrors', 'reset', 'submit',
    'validate', 'isValid', 'isSubmitting', 'setSubmitting',
  ],
  table: [
    'getData', 'setData', 'getColumns', 'setColumns', 'setPage', 'setPageSize',
    'nextPage', 'prevPage', 'sort', 'clearSort', 'filter', 'setSearch',
    'select', 'deselect', 'selectAll', 'clearSelection', 'getSelectedRows',
    'getSelectedKeys', 'setDensity', 'setVariant', 'setLoading', 'isLoading',
    'exportData', 'getPaginatedRows', 'getFilteredRows',
  ],
  list: ['append', 'patch', 'clear', 'count', 'lock', 'unlock', 'isLocked'],
  lister: ['append', 'patch', 'clear', 'count', 'lock', 'unlock', 'isLocked'],
  chart: ['chartState', 'setKind', 'setLabels', 'setSeries', 'getRenderer'],
  login: ['getValues', 'setValue', 'validate', 'submit', 'reset'],
  signup: ['getValues', 'setValue', 'validate', 'submit', 'reset'],
}

const CONFIG = [
  "import { defineConfig } from '@morgana/sdk'",
  "export default defineConfig({ name: 'hs', entry: 'home' })",
].join('\n')

/** One compile action declaring one object of every kind under test. */
const seedLines: string[] = [
  "import { defineClientAction } from '@morgana/sdk'",
  'export const seed = defineClientAction({',
  '  config: { on: "compile" },',
  '  handler: (ctx) => {',
  "    const p = ctx.ui.pages.create({ name: 'home', address: '/' })",
]
for (const kind of Object.keys(EXPECTED)) {
  // Must be placed on the page: only objects reachable from the page roots are
  // in the page manifest, and ctx.ui.get() reads from that manifest.
  seedLines.push(`    p.place(ctx.ui.${kind}({ id: 'k_${kind}' }))`)
}
seedLines.push('    return { ok: true }', '  },', '})')

/** A probe that reports the typeof every expected method on every kind. */
function probeLines(): string[] {
  const out: string[] = []
  for (const [kind, methods] of Object.entries(EXPECTED)) {
    for (const m of methods) {
      out.push(`try { window.__t['${kind}.${m}'] = typeof ctx.ui.get('k_${kind}').${m} }`)
      out.push(`catch (e) { window.__t['${kind}.${m}'] = 'THREW: ' + e.message }`)
    }
  }
  // `value` is a property on InputHandle, not a method.
  for (const kind of ['input', 'textarea']) {
    out.push(`try { window.__t['${kind}.value'] = typeof ctx.ui.get('k_${kind}').value }`)
    out.push(`catch (e) { window.__t['${kind}.value'] = 'THREW: ' + e.message }`)
  }
  return out
}

async function checkSurface(): Promise<Record<string, string>> {
  const dir = fs.mkdtempSync(path.join(tmpdir(), 'morgana-hs-'))
  const write = (rel: string, text: string): void => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    fs.writeFileSync(path.join(dir, rel), text, 'utf8')
  }
  write('morgana.config.ts', CONFIG)
  write('src/actions/compile/seed.ts', seedLines.join('\n'))
  write(
    'src/actions/browser/probe.ts',
    [
      "import { defineClientAction } from '@morgana/sdk'",
      'export const probe = defineClientAction({',
      '  handler: (ctx) => {',
      '    window.__t = {}',
      ...probeLines(),
      '  },',
      '})',
    ].join('\n'),
  )
  await compileProject({ dir, outDir: path.join(dir, 'dist') })
  const html = fs.readFileSync(path.join(dir, 'dist', 'pages', 'home.html'), 'utf8')
  const manifest = /<script id="__MORGANA_OBJECTS__" type="application\/json">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '{}'
  const clientJs = fs.readFileSync(path.join(dir, 'dist', 'assets', 'client.js'), 'utf8')

  // Minimal boot: the runtime only needs a document it can query by entity.
  const doc = {
    readyState: 'complete',
    body: { getAttribute: (k: string) => (k === 'data-page' ? 'home' : null) },
    head: { appendChild: () => {} },
    documentElement: { appendChild: () => {} },
    getElementById: (id: string) => (id === '__MORGANA_OBJECTS__' ? { textContent: manifest } : null),
    createElement: () => ({ setAttribute() {}, appendChild() {}, textContent: '', style: {} }),
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  const win: Record<string, unknown> = { document: doc }
  const g = globalThis as Record<string, unknown>
  const prevDoc = g['document']
  const prevWin = g['window']
  g['document'] = doc
  g['window'] = win
  try {
    const load = new Function('window', 'document', `${clientJs}\nreturn window;`) as (
      w: unknown,
      d: unknown,
    ) => Record<string, unknown>
    const loaded = load(win, doc)
    const run = loaded['__morgana_run'] as (n: string, p: unknown) => Promise<unknown>
    await run('probe', {})
    await new Promise((r) => setTimeout(r, 20))
    return (loaded['__t'] ?? {}) as Record<string, string>
  } finally {
    g['document'] = prevDoc
    g['window'] = prevWin
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

describe('typed handle surface', () => {
  it('every declared method exists and is callable', async () => {
    const types = await checkSurface()
    // `*.value` is a property, asserted separately below.
    const missing = Object.entries(types)
      .filter(([k, t]) => t !== 'function' && !k.endsWith('.value'))
      .map(([k, t]) => `${k} → ${t}`)
    expect(missing, 'declared handle methods that are missing or not callable').toEqual([])
  }, 60_000)

  it('value is a readable/writable property on input and textarea', async () => {
    const types = await checkSurface()
    expect(types['input.value']).toBe('string')
    expect(types['textarea.value']).toBe('string')
  }, 60_000)

  it('the base ObjectHandle is present on every kind', async () => {
    const dir = fs.mkdtempSync(path.join(tmpdir(), 'morgana-hs2-'))
    const write = (rel: string, text: string): void => {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
      fs.writeFileSync(path.join(dir, rel), text, 'utf8')
    }
    write('morgana.config.ts', CONFIG)
    write('src/actions/compile/seed.ts', seedLines.join('\n'))
    write(
      'src/actions/browser/probe.ts',
      [
        "import { defineClientAction } from '@morgana/sdk'",
        'export const probe = defineClientAction({',
        '  handler: (ctx) => {',
        '    const base = ["get","set","setProps","make","bind","move","remove","when","track",',
        '      "setWithBreakpoint","getWithBreakpoint","breakpointProps","clearBreakpoint",',
        '      "emit","getElement","getElements"]',
        '    window.__bad = []',
        '    for (const id of Object.keys(window.__MORGANA_OBJECTS__.objects)) {',
        '      const h = ctx.ui.get(id)',
        '      if (!h) { window.__bad.push(id + ": no handle"); continue }',
        '      for (const m of base) if (typeof h[m] !== "function") window.__bad.push(id + "." + m)',
        '    }',
        '  },',
        '})',
      ].join('\n'),
    )
    await compileProject({ dir, outDir: path.join(dir, 'dist') })
    const html = fs.readFileSync(path.join(dir, 'dist', 'pages', 'home.html'), 'utf8')
    const manifest = /<script id="__MORGANA_OBJECTS__" type="application\/json">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '{}'
    const clientJs = fs.readFileSync(path.join(dir, 'dist', 'assets', 'client.js'), 'utf8')
    const doc = {
      readyState: 'complete',
      body: { getAttribute: () => 'home' },
      head: { appendChild: () => {} },
      documentElement: { appendChild: () => {} },
      getElementById: (id: string) => (id === '__MORGANA_OBJECTS__' ? { textContent: manifest } : null),
      createElement: () => ({ setAttribute() {}, appendChild() {}, textContent: '', style: {} }),
      querySelectorAll: () => [],
      querySelector: () => null,
      addEventListener: () => {},
      removeEventListener: () => {},
    }
    const win: Record<string, unknown> = { document: doc }
    // The page manifest travels in a script tag; mirror it onto the stub window
    // so the probe can enumerate the objects it is meant to cover.
    win['__MORGANA_OBJECTS__'] = JSON.parse(manifest.replace(/\\u003c/g, '<'))
    const g = globalThis as Record<string, unknown>
    const prevDoc = g['document']
    const prevWin = g['window']
    g['document'] = doc
    g['window'] = win
    try {
      const load = new Function('window', 'document', `${clientJs}\nreturn window;`) as (
        w: unknown,
        d: unknown,
      ) => Record<string, unknown>
      const loaded = load(win, doc)
      const run = loaded['__morgana_run'] as (n: string, p: unknown) => Promise<unknown>
      await run('probe', {})
      await new Promise((r) => setTimeout(r, 20))
      expect(loaded['__bad']).toEqual([])
    } finally {
      g['document'] = prevDoc
      g['window'] = prevWin
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)
})
