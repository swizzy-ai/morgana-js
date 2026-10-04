/**
 * Behaviors — client.js interactions against a stub DOM.
 *
 * Covers table sort + pagination, tabs, dialogs, dismiss/remove,
 * switch toggles and checkbox change dispatch using the real bundle.
 */
import { describe, expect, it } from 'vitest'
import { emptyManifest, makeClientJs } from './client-harness'

class El {
  tagName: string
  attrs: Record<string, string> = {}
  children: El[] = []
  parent: El | null = null
  textContent = ''
  style: Record<string, string> = {}
  disabled = false
  removed = false
  checked = false
  value = ''

  constructor(tag: string, attrs: Record<string, string> = {}, text = '') {
    this.tagName = tag.toUpperCase()
    this.attrs = { ...attrs }
    this.textContent = text
  }

  getAttribute(k: string): string | null {
    return this.attrs[k] ?? null
  }
  setAttribute(k: string, v: string): void {
    this.attrs[k] = v
  }
  removeAttribute(k: string): void {
    delete this.attrs[k]
  }
  hasAttribute(k: string): boolean {
    return k in this.attrs
  }
  appendChild(child: El): void {
    const i = this.children.indexOf(child)
    if (i >= 0) this.children.splice(i, 1)
    child.parent = this
    this.children.push(child)
  }
  get parentNode(): El | null {
    return this.parent
  }
  get previousElementSibling(): El | null {
    if (!this.parent) return null
    const i = this.parent.children.indexOf(this)
    return i > 0 ? this.parent.children[i - 1]! : null
  }
  get nextElementSibling(): El | null {
    if (!this.parent) return null
    const i = this.parent.children.indexOf(this)
    return i >= 0 && i < this.parent.children.length - 1 ? this.parent.children[i + 1]! : null
  }
  remove(): void {
    this.removed = true
    if (this.parent) {
      const i = this.parent.children.indexOf(this)
      if (i >= 0) this.parent.children.splice(i, 1)
    }
  }
  click(): void {
    fire('click', { target: fakeTarget(this) })
  }
  closest(sel: string): El | null {
    let el: El | null = this
    while (el) {
      if (matches(el, sel)) return el
      el = el.parent
    }
    return null
  }
  querySelector(sel: string): El | null {
    return queryAll(this, sel)[0] ?? null
  }
  querySelectorAll(sel: string): El[] {
    return queryAll(this, sel)
  }
  get rows(): El[] {
    return this.tagName === 'TBODY' ? this.children : []
  }
  get cells(): El[] {
    return this.tagName === 'TR' ? this.children : []
  }
  get tBodies(): Array<{ rows: El[]; appendChild(c: El): void }> {
    if (this.tagName !== 'TABLE') return []
    const bodies = this.children.filter((c) => c.tagName === 'TBODY')
    return bodies.map((b) => ({
      get rows() {
        return b.children
      },
      appendChild: (c: El) => b.appendChild(c),
    }))
  }
}

function matchesCompound(el: El, compound: string): boolean {
  const m = /^([a-zA-Z*]+)?((?:\[[^\]]+\])*)$/.exec(compound.trim())
  if (!m) return false
  const conds: Array<[string, string | null]> = []
  for (const mm of (m[2] ?? '').matchAll(/\[([^\]=]+)(?:="([^"]*)")?\]/g)) {
    conds.push([mm[1]!, mm[2] ?? null])
  }
  if (m[1] && m[1] !== '*' && el.tagName !== m[1].toUpperCase()) return false
  return conds.every(([k, v]) => (v === null ? el.hasAttribute(k) : el.getAttribute(k) === v))
}

/** Split a selector on descendant combinators (spaces outside []/quotes). */
function splitDesc(sel: string): string[] {
  const parts: string[] = []
  let cur = ''
  let depth = 0
  let quote = ''
  for (const ch of sel) {
    if (quote) {
      cur += ch
      if (ch === quote) quote = ''
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      cur += ch
      continue
    }
    if (ch === '[') depth += 1
    if (ch === ']') depth = Math.max(0, depth - 1)
    if (ch === ' ' && depth === 0) {
      if (cur.trim()) parts.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  if (cur.trim()) parts.push(cur.trim())
  return parts
}

/** Real descendant semantics: rightmost compound matches el itself. */
function matches(el: El, sel: string): boolean {
  return sel.split(',').some((alt) => {
    const parts = splitDesc(alt)
    if (parts.length === 0) return false
    if (!matchesCompound(el, parts[parts.length - 1]!)) return false
    let node = el.parent
    for (let i = parts.length - 2; i >= 0; i--) {
      while (node && !matchesCompound(node, parts[i]!)) node = node.parent
      if (!node) return false
      node = node.parent
    }
    return true
  })
}

function queryAll(root: El, sel: string): El[] {
  const out: El[] = []
  const walk = (el: El): void => {
    for (const c of el.children) {
      if (matches(c, sel)) out.push(c)
      walk(c)
    }
  }
  walk(root)
  return out
}

const fakeTarget = (el: El): { closest(sel: string): El | null } => ({
  closest: (sel: string) => el.closest(sel),
})

let listeners: Record<string, Array<(e: { target: { closest(sel: string): El | null } }) => void>> = {}
let registry: El[] = []

function fire(ev: string, e: { target: { closest(sel: string): El | null } }): void {
  for (const fn of listeners[ev] ?? []) fn(e)
}

function install(state: Record<string, unknown>): Record<string, unknown> {
  listeners = {}
  registry = []
  const win: Record<string, unknown> = {}
  const box: { current: Record<string, unknown> } = { current: state }
  const documentStub = {
    readyState: 'complete',
    getElementById: (id: string) => {
      if (id === '__MORGANA_OBJECTS__') return { textContent: emptyManifest() }
      if (id !== '__MORGANA_STATE__') return null
      return {
        get textContent() {
          return JSON.stringify(box.current)
        },
        set textContent(v: string) {
          box.current = JSON.parse(v) as Record<string, unknown>
        },
      }
    },
    querySelectorAll: (sel: string) => {
      if (sel === '[data-bind]') return []
      const out: El[] = []
      for (const r of registry) {
        if (matches(r, sel)) out.push(r)
        out.push(...queryAll(r, sel))
      }
      return out
    },
    querySelector: (sel: string) => {
      for (const r of registry) {
        if (matches(r, sel)) return r
        const found = queryAll(r, sel)[0]
        if (found) return found
      }
      return null
    },
    addEventListener: (ev: string, fn: (e: never) => void) => {
      ;(listeners[ev] ??= []).push(fn as (e: { target: { closest(sel: string): El | null } }) => void)
    },
  }
  ;(globalThis as Record<string, unknown>)['window'] = win
  ;(globalThis as Record<string, unknown>)['document'] = documentStub
  return win
}

function load(js: string, win: Record<string, unknown>): void {
  const run = new Function('window', 'document', `${js}\nreturn window;`) as (
    w: unknown,
    d: unknown,
  ) => Record<string, unknown>
  Object.assign(win, run(win, (globalThis as Record<string, unknown>)['document']))
}

function cleanup(): void {
  delete (globalThis as Record<string, unknown>)['window']
  delete (globalThis as Record<string, unknown>)['document']
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

function tableFixture(): { table: El; thA: El; thB: El } {
  const table = new El('table')
  const thead = new El('thead')
  const hr = new El('tr')
  const thA = new El('th', { 'data-column': 'name', 'data-sortable': 'true' }, 'Name')
  thA.appendChild(new El('span', { 'data-part': 'sort-arrow' }, '⇅'))
  const thB = new El('th', { 'data-column': 'total', 'data-sortable': 'true' }, 'Total')
  thB.appendChild(new El('span', { 'data-part': 'sort-arrow' }, '⇅'))
  hr.appendChild(thA)
  hr.appendChild(thB)
  thead.appendChild(hr)
  const tbody = new El('tbody')
  const mk = (name: string, total: string): El => {
    const tr = new El('tr', { 'data-row': '0' })
    tr.appendChild(new El('td', {}, name))
    tr.appendChild(new El('td', {}, total))
    return tr
  }
  tbody.appendChild(mk('b', '20'))
  tbody.appendChild(mk('a', '5'))
  table.appendChild(thead)
  table.appendChild(tbody)
  return { table, thA, thB }
}

describe('dom bridge', () => {
  it(
    'dispatches hover/focus/blur/dblclick/reset/scroll/resize/visibilitychange',
    async () => {
      const box = new El('div', { 'data-entity': 'b' })
      const input = new El('input', { 'data-entity': 'i' })
      const form = new El('form', { 'data-entity': 'f' })
      const win = install({})
      registry = [box, input, form]
      try {
        load(
          await makeClientJs(
            { rec: 'export const rec = (ctx) => { globalThis.seen.push(ctx.event.name + "@" + ctx.event.origin) }' },
            ['hover', 'focus', 'blur', 'dblclick', 'reset', 'scroll', 'resize', 'visibilitychange'].map((e) => ({ event: e, action: 'rec' })),
          ),
          win,
        )
        ;(globalThis as Record<string, unknown>)['seen'] = []
        await sleep(10)
        fire('mouseover', { target: fakeTarget(box) })
        fire('focusin', { target: fakeTarget(input) })
        fire('focusout', { target: fakeTarget(input) })
        fire('dblclick', { target: fakeTarget(box) })
        fire('reset', { target: fakeTarget(form) })
        fire('scroll', { target: fakeTarget(box) })
        fire('resize', { target: fakeTarget(box) })
        fire('visibilitychange', { target: fakeTarget(box) })
        expect((globalThis as Record<string, unknown>)['seen']).toEqual([
          'hover@b',
          'focus@i',
          'blur@i',
          'dblclick@b',
          'reset@f',
          'scroll@',
          'resize@',
          'visibilitychange@',
        ])
      } finally {
        delete (globalThis as Record<string, unknown>)['seen']
        cleanup()
      }
    },
    30_000,
  )
})

describe('table sort + pagination', () => {
  it(
    'sorts rows on header click and toggles direction',
    async () => {
      const { table, thB } = tableFixture()
      const win = install({})
      registry = [table]
      try {
        load(await makeClientJs({}), win)
        await sleep(10)
        fire('click', { target: fakeTarget(thB) })
        const names = () => table.tBodies[0]!.rows.map((r) => r.cells[0]!.textContent)
        expect(names()).toEqual(['a', 'b'])
        expect(thB.getAttribute('data-sort-dir')).toBe('asc')
        fire('click', { target: fakeTarget(thB) })
        expect(names()).toEqual(['b', 'a'])
        expect(thB.getAttribute('data-sort-dir')).toBe('desc')
      } finally {
        cleanup()
      }
    },
    30_000,
  )
})

describe('tabs', () => {
  it(
    'switches active tab + panel',
    async () => {
      const root = new El('div', { 'data-kind': 'tabs' })
      const list = new El('div', { 'data-part': 'tab-list' })
      const t1 = new El('div', { 'data-part': 'tab', 'data-tab-key': 'a', 'data-active': 'true' }, 'A')
      const t2 = new El('div', { 'data-part': 'tab', 'data-tab-key': 'b' }, 'B')
      const t3 = new El('div', { 'data-part': 'tab', 'data-tab-key': 'c', 'data-disabled': 'true' }, 'C')
      list.appendChild(t1)
      list.appendChild(t2)
      list.appendChild(t3)
      const p1 = new El('div', { 'data-part': 'panel', 'data-panel-key': 'a' }, 'AAA')
      const p2 = new El('div', { 'data-part': 'panel', 'data-panel-key': 'b', hidden: '' }, 'BBB')
      root.appendChild(list)
      root.appendChild(p1)
      root.appendChild(p2)
      const win = install({})
      registry = [root]
      try {
        load(await makeClientJs({}), win)
        await sleep(10)
        fire('click', { target: fakeTarget(t2) })
        expect(t2.getAttribute('data-active')).toBe('true')
        expect(t1.hasAttribute('data-active')).toBe(false)
        expect(p2.hasAttribute('hidden')).toBe(false)
        expect(p1.getAttribute('hidden')).toBe('')
        // Disabled tabs do not switch.
        fire('click', { target: fakeTarget(t3) })
        expect(t2.getAttribute('data-active')).toBe('true')
      } finally {
        cleanup()
      }
    },
    30_000,
  )
})

describe('dialog + dismiss + remove', () => {
  it(
    'opens, confirms and closes dialogs; dismisses alerts; removes badges',
    async () => {
      const dlg = new El('div', { 'data-kind': 'dialog', 'data-entity': 'd' })
      dlg.style['display'] = 'none'
      const overlay = new El('div', { 'data-part': 'overlay', 'data-close': 'true' })
      const confirm = new El('button', { 'data-part': 'confirm' }, 'Yes')
      dlg.appendChild(overlay)
      dlg.appendChild(confirm)
      const opener = new El('button', { 'data-open-dialog': 'd' }, 'Open')
      const alert = new El('div', { 'data-kind': 'alert' })
      const ax = new El('button', { 'data-part': 'dismiss' }, '×')
      alert.appendChild(ax)
      const badge = new El('span', { 'data-kind': 'badge' })
      const rm = new El('button', { 'data-part': 'remove' }, '×')
      badge.appendChild(rm)
      registry = [dlg, opener, alert, badge]
      const state: Record<string, unknown> = {}
      const win = install(state)
      registry = [dlg, opener, alert, badge]
      try {
        load(
          await makeClientJs(
            { onSubmit: 'export const onSubmit = (ctx) => { globalThis.done.push(ctx.event.name) }' },
            [{ event: 'submitted', action: 'onSubmit' }],
          ),
          win,
        )
        ;(globalThis as Record<string, unknown>)['done'] = []
        await sleep(10)
        fire('click', { target: fakeTarget(opener) })
        expect(dlg.style['display']).toBe('flex')
        fire('click', { target: fakeTarget(confirm) })
        expect(dlg.style['display']).toBe('none')
        expect((globalThis as Record<string, unknown>)['done']).toEqual(['submitted'])
        fire('click', { target: fakeTarget(overlay) })
        fire('click', { target: fakeTarget(opener) })
        fire('click', { target: fakeTarget(ax) })
        expect(alert.style['display']).toBe('none')
        fire('click', { target: fakeTarget(rm) })
        expect(badge.removed).toBe(true)
      } finally {
        delete (globalThis as Record<string, unknown>)['done']
        cleanup()
      }
    },
    30_000,
  )
})

describe('switch + checkbox dispatch', () => {
  it(
    'flips data-checked and fires changed actions',
    async () => {
      const sw = new El('div', { 'data-kind': 'switch', 'data-entity': 's', 'data-checked': 'false' })
      const track = new El('div', { 'data-part': 'track', role: 'switch', tabindex: '0' })
      track.setAttribute('aria-checked', 'false')
      sw.appendChild(track)
      const win = install({})
      registry = [sw]
      try {
        load(
          await makeClientJs(
            { watch: 'export const watch = (ctx) => { globalThis.seen.push(ctx.event.payload.checked) }' },
            [{ event: 'changed', action: 'watch' }],
          ),
          win,
        )
        ;(globalThis as Record<string, unknown>)['seen'] = []
        await sleep(10)
        fire('click', { target: fakeTarget(track) })
        expect(sw.getAttribute('data-checked')).toBe('true')
        expect(track.getAttribute('aria-checked')).toBe('true')
        fire('click', { target: fakeTarget(track) })
        expect(sw.getAttribute('data-checked')).toBe('false')
        expect((globalThis as Record<string, unknown>)['seen']).toEqual([true, false])
      } finally {
        delete (globalThis as Record<string, unknown>)['seen']
        cleanup()
      }
    },
    30_000,
  )

  it(
    'dispatches changed on checkbox input',
    async () => {
      const label = new El('label', { 'data-entity': 'c', 'data-kind': 'checkbox' })
      const input = new El('input', { type: 'checkbox' })
      input.checked = true
      label.appendChild(input)
      const win = install({})
      registry = [label]
      try {
        load(
          await makeClientJs(
            { watch: 'export const watch = (ctx) => { globalThis.seen.push(ctx.event.payload.checked) }' },
            [{ event: 'changed', action: 'watch' }],
          ),
          win,
        )
        ;(globalThis as Record<string, unknown>)['seen'] = []
        await sleep(10)
        for (const fn of listeners['change'] ?? []) fn({ target: { closest: (sel: string) => input.closest(sel) } })
        expect((globalThis as Record<string, unknown>)['seen']).toEqual([true])
      } finally {
        delete (globalThis as Record<string, unknown>)['seen']
        cleanup()
      }
    },
    30_000,
  )
})
