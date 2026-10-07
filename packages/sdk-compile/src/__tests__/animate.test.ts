/**
 * Animate surface guard.
 *
 * The gap this locks in: `handle.animate(name, opts)` was a typed stub whose
 * browser implementation threw "not implemented" and whose compile-lane
 * version was a bare no-op — so the only working animation was `make()` words
 * baked in at compile time, with no timing control, no completion, and no way
 * to trigger motion from a browser action.
 *
 * This asserts the three layers: pure preset/Dim math, the `extendAnimate`
 * driver against a fake element (promise + `animated` emission in every
 * settle path), and the compiled surface on a real page (namespace present on
 * handles, unknown names rejected, runs resolve).
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { compileProject } from '../index'
import {
  extendAnimate,
  normalizeIterations,
  presetDefaults,
  presetKeyframes,
  resolveDistanceToPx,
} from '../client/handles/animate'

const PRESETS = [
  'fadeIn', 'fadeOut', 'slideUp', 'slideDown', 'slideLeft', 'slideRight',
  'slideIn', 'slideOut', 'scaleIn', 'scaleOut', 'pulse', 'bounce', 'spin', 'smooth', 'bouncy',
  'sway',
]

describe('animate math', () => {
  it('resolves Dim distances to px', () => {
    expect(resolveDistanceToPx(2, 4, {})).toBe(8)
    expect(resolveDistanceToPx(0, 4, {})).toBe(0)
    expect(resolveDistanceToPx('sidebar', 4, { sidebar: 56 })).toBe(224)
    expect(resolveDistanceToPx('12px', 4, {})).toBe(12)
    expect(resolveDistanceToPx('3', 4, {})).toBe(12)
    // Garbage falls back to two grid units rather than throwing.
    expect(resolveDistanceToPx('fill', 4, {})).toBe(8)
    expect(resolveDistanceToPx(undefined, 4, {})).toBe(8)
    // A broken unit falls back to the 4px default.
    expect(resolveDistanceToPx(2, Number.NaN, {})).toBe(8)
  })

  it('builds every preset, with the documented travel directions', () => {
    for (const preset of PRESETS) {
      expect(presetKeyframes(preset, 8), preset).not.toBeNull()
    }
    const tx = (kf: Array<Record<string, unknown>>): string => String(kf[0]?.['transform'] ?? '')
    // Entrances start displaced and settle at rest …
    expect(tx(presetKeyframes('slideUp', 8) ?? [])).toContain('translate(0px, 8px)')
    expect(tx(presetKeyframes('slideDown', 8) ?? [])).toContain('translate(0px, -8px)')
    expect(tx(presetKeyframes('slideLeft', 8) ?? [])).toContain('translate(8px, 0px)')
    expect(tx(presetKeyframes('slideRight', 8) ?? [])).toContain('translate(-8px, 0px)')
    expect(tx(presetKeyframes('slideIn', 8, { from: 'left' }) ?? [])).toContain('translate(-8px, 0px)')
    // … "from below" starts below rest (screen +y), travelling up into place.
    expect(tx(presetKeyframes('slideIn', 8, { from: 'down' }) ?? [])).toContain('translate(0px, 8px)')
    // … exits start at rest and travel outward …
    const out = presetKeyframes('slideOut', 8, { to: 'right' }) ?? []
    expect(String(out[0]?.['transform'])).toBe('none')
    expect(String(out[1]?.['transform'])).toContain('translate(8px, 0px)')
    // … spin honors turns, sway drifts along its axis, unknown presets are null.
    expect(String(presetKeyframes('spin', 8, { turns: 2 })?.[1]?.['transform'])).toContain('720deg')
    expect(String(presetKeyframes('sway', 8)?.[1]?.['transform'])).toContain('translate(8px, 0px)')
    expect(String(presetKeyframes('sway', 8, { axis: 'y' })?.[1]?.['transform'])).toContain('translate(0px, 8px)')
    // Sway is a positional drift, not an exit — both keyframes hold opacity 1.
    // Fading the far keyframe to 0 blinked the element near-invisible for half
    // of every cycle (taskboard motion demo: green box flickering, not sliding).
    for (const axis of [undefined, { axis: 'y' }] as const) {
      const kf = presetKeyframes('sway', 8, axis ?? {}) ?? []
      expect(kf.map((k) => k['opacity'])).toEqual(['1', '1'])
    }
    expect(presetDefaults('sway')).toEqual({ duration: 1200, easing: 'ease-in-out', fill: 'none' })
    expect(presetKeyframes('nope', 8)).toBeNull()
  })

  it('normalizes loop counts and per-preset timing', () => {
    expect(normalizeIterations(true)).toBe(Number.POSITIVE_INFINITY)
    expect(normalizeIterations(3)).toBe(3)
    expect(normalizeIterations(0)).toBe(1)
    expect(normalizeIterations(undefined)).toBe(1)
    expect(presetDefaults('spin')).toEqual({ duration: 1000, easing: 'linear', fill: 'none' })
    expect(presetDefaults('fadeOut')).toEqual({ duration: 350, easing: 'ease-in', fill: 'forwards' })
    expect(presetDefaults('fadeIn')).toEqual({ duration: 350, easing: 'ease-out', fill: 'backwards' })
  })
})

/** A minimal HandleCtx: element + event recorder, everything else inert. */
function fakeCtx(calls: Array<{ el: unknown; timing: unknown }>, emitted: Array<{ event: string; payload: unknown }>, el: unknown) {
  return {
    id: 'k_box',
    kind: 'box',
    meta: { props: {} },
    el,
    setProp: () => {},
    getProp: () => undefined,
    emit: (event: string, payload?: unknown) => {
      emitted.push({ event, payload })
    },
    handle: {},
    reevaluate: () => {},
    unit: 4,
    measures: {},
    __calls: calls,
  } as unknown as Parameters<typeof extendAnimate>[0]
}

function fakeEl(finished: Promise<void>, calls: Array<{ el: unknown; timing: unknown }>) {
  return {
    animate: (kf: unknown, timing: unknown) => {
      calls.push({ el: kf, timing })
      return { finished }
    },
  }
}

describe('animate driver', () => {
  it('runs a preset, resolves, and emits animated', async () => {
    const calls: Array<{ el: unknown; timing: unknown }> = []
    const emitted: Array<{ event: string; payload: unknown }> = []
    const ctx = fakeCtx(calls, emitted, fakeEl(Promise.resolve(), calls))
    const handle: Record<string, unknown> = {}
    ;(ctx as unknown as { handle: unknown }).handle = handle
    extendAnimate(ctx)
    const animate = handle['animate'] as {
      fadeIn(o?: Record<string, unknown>): Promise<void>
      to(k: unknown[], o?: Record<string, unknown>): Promise<void>
    }
    await animate.fadeIn({ duration: 120 })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.timing).toMatchObject({ duration: 120 })
    expect(emitted).toEqual([{ event: 'animated', payload: { animation: 'fadeIn', cancelled: false } }])
    // The string vocabulary resolves to the same presets.
    await (handle['animate'] as (n: string) => Promise<void>)('fade-in')
    expect(emitted[1]).toEqual({ event: 'animated', payload: { animation: 'fadeIn', cancelled: false } })
    // Raw keyframes pass straight through.
    await animate.to([{ opacity: '0' }, { opacity: '1' }], { duration: 50 })
    expect((calls[2]?.el as unknown[])).toHaveLength(2)
  })

  it('settles (never hangs) when the run is cancelled, and still emits', async () => {
    const calls: Array<{ el: unknown; timing: unknown }> = []
    const emitted: Array<{ event: string; payload: unknown }> = []
    const ctx = fakeCtx(calls, emitted, fakeEl(Promise.reject(new Error('aborted')), calls))
    const handle: Record<string, unknown> = {}
    ;(ctx as unknown as { handle: unknown }).handle = handle
    extendAnimate(ctx)
    await (handle['animate'] as { fadeOut(): Promise<void> }).fadeOut()
    expect(emitted).toEqual([{ event: 'animated', payload: { animation: 'fadeOut', cancelled: true } }])
  })

  it('resolves without an element, and rejects unknown names', async () => {
    const emitted: Array<{ event: string; payload: unknown }> = []
    const ctx = fakeCtx([], emitted, null)
    const handle: Record<string, unknown> = {}
    ;(ctx as unknown as { handle: unknown }).handle = handle
    extendAnimate(ctx)
    const animate = handle['animate'] as {
      (n: string): Promise<void>
      pulse(): Promise<void>
    }
    await animate.pulse()
    expect(emitted).toEqual([{ event: 'animated', payload: { animation: 'pulse', cancelled: false } }])
    await expect(animate('nope')).rejects.toThrow('unknown animation')
  })

  it('cancels only the tracked run — no getAnimations scan', async () => {
    const cancelled: string[] = []
    const scanned: string[] = []
    const calls: Array<{ el: unknown; timing: unknown }> = []
    const emitted: Array<{ event: string; payload: unknown }> = []
    let releaseFirst!: () => void
    const firstFinished = new Promise<void>((r) => {
      releaseFirst = r
    })
    let n = 0
    const el = {
      animate: (kf: unknown, timing: unknown) => {
        calls.push({ el: kf, timing })
        n += 1
        const tag = n === 1 ? 'first' : 'next'
        return {
          finished: n === 1 ? firstFinished : Promise.resolve(),
          cancel: () => cancelled.push(tag),
        }
      },
      // If the driver scanned the element, this would record it.
      getAnimations: () => {
        scanned.push('scan')
        return []
      },
    }
    const ctx = fakeCtx(calls, emitted, el)
    const handle: Record<string, unknown> = {}
    ;(ctx as unknown as { handle: unknown }).handle = handle
    extendAnimate(ctx)
    const animate = handle['animate'] as {
      slideIn(o?: Record<string, unknown>): Promise<void>
      slideOut(o?: Record<string, unknown>): Promise<void>
    }
    const p1 = animate.slideIn({ from: 'right' })
    expect(scanned).toEqual([])
    // Starting the next run cancels the still-tracked previous one, directly.
    const p2 = animate.slideOut({ to: 'right' })
    expect(cancelled).toEqual(['first'])
    expect(scanned).toEqual([])
    releaseFirst()
    await p1
    await p2
    expect(calls).toHaveLength(2)
    expect(emitted).toEqual([
      { event: 'animated', payload: { animation: 'slideOut', cancelled: false } },
      { event: 'animated', payload: { animation: 'slideIn', cancelled: false } },
    ])
    // The timing carries the ping-pong direction when requested.
    await animate.slideIn({ from: 'right', alternate: true })
    expect(calls[2]?.timing).toMatchObject({ direction: 'alternate' })
  })

  it('a skipped run settles across a macrotask, not synchronously', async () => {
    // A skip that resolves synchronously lets a consumer `await` it in a
    // tight microtask loop that never crosses a task boundary — starving
    // timers, I/O and the page load. The skip must yield.
    const emitted: Array<{ event: string; payload: unknown }> = []
    const ctx = fakeCtx([], emitted, null)
    const handle: Record<string, unknown> = {}
    ;(ctx as unknown as { handle: unknown }).handle = handle
    extendAnimate(ctx)
    const animate = handle['animate'] as { pulse(): Promise<void> }
    let settled = false
    const p = animate.pulse().then(() => {
      settled = true
    })
    // Awaiting a microtask must NOT settle it — the yield is a macrotask.
    await Promise.resolve()
    await Promise.resolve()
    expect(settled).toBe(false)
    expect(emitted).toEqual([])
    await p
    expect(settled).toBe(true)
    expect(emitted).toEqual([{ event: 'animated', payload: { animation: 'pulse', cancelled: false } }])
  })

  it('skips motion under prefers-reduced-motion but still settles', async () => {
    const g = globalThis as Record<string, unknown>
    const prev = g['matchMedia']
    g['matchMedia'] = () => ({ matches: true })
    try {
      const calls: Array<{ el: unknown; timing: unknown }> = []
      const emitted: Array<{ event: string; payload: unknown }> = []
      const ctx = fakeCtx(calls, emitted, fakeEl(Promise.resolve(), calls))
      const handle: Record<string, unknown> = {}
      ;(ctx as unknown as { handle: unknown }).handle = handle
      extendAnimate(ctx)
      await (handle['animate'] as { slideLeft(): Promise<void> }).slideLeft()
      expect(calls).toEqual([])
      expect(emitted).toEqual([{ event: 'animated', payload: { animation: 'slideLeft', cancelled: false } }])
    } finally {
      if (prev === undefined) delete g['matchMedia']
      else g['matchMedia'] = prev
    }
  })
})

const CONFIG = [
  "import { defineConfig } from '@morgana/sdk'",
  "export default defineConfig({ name: 'anim', entry: 'home' })",
].join('\n')

describe('compiled animate surface', () => {
  it('every handle carries the namespace, and runs resolve on a real page', async () => {
    const dir = fs.mkdtempSync(path.join(tmpdir(), 'morgana-anim-'))
    const write = (rel: string, text: string): void => {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
      fs.writeFileSync(path.join(dir, rel), text, 'utf8')
    }
    write('morgana.config.ts', CONFIG)
    write(
      'src/actions/compile/seed.ts',
      [
        "import { defineClientAction } from '@morgana/sdk'",
        'export const seed = defineClientAction({',
        '  config: { on: "compile" },',
        '  handler: (ctx) => {',
        "    const p = ctx.ui.pages.create({ name: 'home', address: '/' })",
        "    p.place(ctx.ui.box({ id: 'k_box' }))",
        '    return { ok: true }',
        '  },',
        '})',
      ].join('\n'),
    )
    write(
      'src/actions/browser/probe.ts',
      [
        "import { defineClientAction } from '@morgana/sdk'",
        'export const probe = defineClientAction({',
        '  handler: async (ctx) => {',
        '    const a = ctx.ui.get("k_box").animate',
        '    const want = ["fadeIn","fadeOut","slideUp","slideDown","slideLeft","slideRight",',
        '      "slideIn","slideOut","scaleIn","scaleOut","pulse","bounce","spin","smooth","bouncy","sway","to"]',
        '    window.__t = { callable: typeof a }',
        '    for (const p of want) window.__t[p] = typeof a[p]',
        '    await a.pulse({ duration: 5 })',
        '    await a("fade-in", { duration: 5 })',
        '    window.__t.ran = "ok"',
        '    try { await a("nope"); window.__t.bad = "resolved" }',
        '    catch (e) { window.__t.bad = "rejected" }',
        '    return window.__t',
        '  },',
        '})',
      ].join('\n'),
    )
    await compileProject({ dir, outDir: path.join(dir, 'dist') })
    const html = fs.readFileSync(path.join(dir, 'dist', 'pages', 'home.html'), 'utf8')
    const manifest =
      /<script id="__MORGANA_OBJECTS__" type="application\/json">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '{}'
    const clientJs = fs.readFileSync(path.join(dir, 'dist', 'assets', 'client.js'), 'utf8')

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
      const out = (await run('probe', {})) as Record<string, string>
      expect(out['callable']).toBe('function')
      for (const p of [
        'fadeIn', 'fadeOut', 'slideUp', 'slideDown', 'slideLeft', 'slideRight',
        'slideIn', 'slideOut', 'scaleIn', 'scaleOut', 'pulse', 'bounce', 'spin', 'smooth', 'bouncy',
        'sway', 'to',
      ]) {
        expect(out[p], `animate.${p}`).toBe('function')
      }
      expect(out['ran']).toBe('ok')
      expect(out['bad']).toBe('rejected')
    } finally {
      g['document'] = prevDoc
      g['window'] = prevWin
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)
})
