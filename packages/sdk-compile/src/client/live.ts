/**
 * The live page — what keeps the screen in step with state, so actions never
 * touch the DOM.
 *
 * Everything here is driven by tables the compiler wrote into the manifest
 * (render/live.ts); nothing is discovered by scanning the page:
 *
 *  - reflected keys: each state key a condition reads is mirrored onto <html>
 *    as `data-s-<key>`, and the compiled stylesheet does the rest;
 *  - declared keys follow the address (`?view=work`) and survive a reload;
 *  - lists bound to a state array stamp, update and remove their rows from
 *    the row template, keyed, touching only the rows that changed;
 *  - containers marked `easesHeight` ease between heights when a key their
 *    insides read changes — one measure, one write, one measure, per change;
 *  - keyboard combos, dropped or picked files, and hand drags arrive as page
 *    events like any click.
 */
import { pageManifest, writeElementProp } from './runtime'
import type { LiveList, LiveTables } from '../render/live'

export interface LiveDeps {
  readState(): Record<string, unknown>
  commitMany(patch: Record<string, unknown>): Record<string, unknown>
  subscribePath(path: string, fn: (path: string, value: unknown, oldValue: unknown, root: Record<string, unknown>) => void): () => void
  dispatchPageEvent(event: string, origin: string, el: Element | null, payload: unknown): void
  /** True when a binding or subscriber listens for this page event. */
  hasPageHandler(event: string): boolean
}

interface Row {
  el: HTMLElement
  json: string
}

interface ListState {
  id: string
  el: HTMLElement
  spec: LiveList
  tpl: HTMLTemplateElement
  rows: Map<string, Row>
  records: Map<string, unknown>
}

const EASE = 'cubic-bezier(.2,.8,.2,1)'
const attrOf = (key: string): string => `data-s-${key.replace(/[^a-zA-Z0-9-]/g, '-')}`
const getPath = (root: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((acc, k) => (acc as Record<string, unknown> | null | undefined)?.[k], root)
const reducedMotion = (): boolean => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const entity = (id: string): HTMLElement | null => document.querySelector<HTMLElement>(`[data-entity="${id.replace(/["\\]/g, '\\$&')}"]`)
/** What an event reports as its origin: a stamped row's template object, else the object. */
const originOf = (el: Element | null): string => (el ? el.getAttribute('data-tpl') ?? el.getAttribute('data-entity') ?? '' : '')

export function bootLive(deps: LiveDeps): void {
  const m = pageManifest()
  const tables: LiveTables | undefined = m.live
  if (!tables) return
  const page = m.page
  const { decls, reflect, initial } = tables.state

  // ── restore: the address, then what was kept, then the declared start ──
  const params = new URLSearchParams(location.search)
  const coerce = (key: string, raw: string): unknown =>
    typeof initial[key] === 'boolean' ? raw === 'true' : typeof initial[key] === 'number' ? Number(raw) : raw
  const storeFor = (keep: 'session' | 'device'): Storage | null => {
    try { return keep === 'device' ? localStorage : sessionStorage } catch { return null }
  }
  const storageKey = (key: string): string => `morgana:${page}:${key}`
  // Each key's value before the address or storage touched it: what "unchanged" means
  // for the address, also on a page whose own start values don't list the key.
  const booted = deps.readState()
  const startOf: Record<string, unknown> = {}
  for (const key of Object.keys(decls)) startOf[key] = key in initial ? initial[key] : getPath(booted, key)
  const restored: Record<string, unknown> = {}
  for (const [key, d] of Object.entries(decls)) {
    if (d.keep) {
      try {
        const kept = storeFor(d.keep)?.getItem(storageKey(key))
        if (kept !== null && kept !== undefined) restored[key] = JSON.parse(kept)
      } catch { /* unreadable: keep the start value */ }
    }
    if (d.address && params.has(d.address)) restored[key] = coerce(key, params.get(d.address) as string)
  }
  if (Object.keys(restored).length) deps.commitMany(restored)

  // ── heights that ease ──
  const morphs = Object.entries(tables.morph)
    .map(([id, keys]) => ({ el: entity(id), keys: new Set(keys), anim: null as Animation | null }))
    .filter((x): x is { el: HTMLElement; keys: Set<string>; anim: Animation | null } => !!x.el)

  // ── reflection: one attribute per key; the stylesheet does the rest ──
  const html = document.documentElement
  const reflectKey = (key: string, value: unknown): void => {
    const attr = attrOf(key)
    const next = value === undefined || value === null ? null : String(value)
    if (html.getAttribute(attr) === next) return
    const moving = reducedMotion() ? [] : morphs.filter((x) => x.keys.has(key))
    const before = moving.map((x) => x.el.getBoundingClientRect().height)
    if (next === null) html.removeAttribute(attr)
    else html.setAttribute(attr, next)
    if (key === 'theme.mode' && (next === 'light' || next === 'dark' || next === 'system')) document.body.setAttribute('data-mode', next)
    moving.forEach((x, i) => {
      x.anim?.cancel()
      const to = x.el.getBoundingClientRect().height
      const from = before[i] as number
      if (Math.abs(to - from) < 1) return
      // No fill: once it lands the box is back to its natural height, so
      // content that keeps growing afterwards is never cut off.
      x.anim = x.el.animate(
        [{ height: `${from}px`, overflow: 'hidden' }, { height: `${to}px`, overflow: 'hidden' }],
        { duration: 600, easing: EASE },
      )
    })
  }
  const root = deps.readState()
  for (const key of reflect) {
    reflectKey(key, getPath(root, key))
    deps.subscribePath(key, (_p, _v, _o, r) => reflectKey(key, getPath(r, key)))
  }

  // ── the address and the kept keys follow every change ──
  const addressed = Object.entries(decls).filter(([, d]) => d.address)
  const writeAddress = (): void => {
    const url = new URL(location.href)
    const now = deps.readState()
    for (const [key, d] of addressed) {
      const v = getPath(now, key)
      if (v === undefined || v === null || v === '' || v === startOf[key]) url.searchParams.delete(d.address as string)
      else url.searchParams.set(d.address as string, String(v))
    }
    if (url.href !== location.href) history.replaceState(history.state, '', url)
  }
  for (const [key] of addressed) deps.subscribePath(key, writeAddress)
  if (addressed.length) {
    writeAddress()
    window.addEventListener('popstate', () => {
      const q = new URLSearchParams(location.search)
      const patch: Record<string, unknown> = {}
      for (const [key, d] of addressed) patch[key] = q.has(d.address as string) ? coerce(key, q.get(d.address as string) as string) : startOf[key]
      deps.commitMany(patch)
    })
  }
  for (const [key, d] of Object.entries(decls)) {
    if (!d.keep) continue
    deps.subscribePath(key, (_p, _v, _o, r) => {
      try { storeFor(d.keep as 'session' | 'device')?.setItem(storageKey(key), JSON.stringify(getPath(r, key) ?? null)) } catch { /* full or blocked */ }
    })
  }

  // ── lists: rows stamped from the template, keyed ──
  const lists = new Map<HTMLElement, ListState>()
  const byId = new Map<string, ListState>()
  for (const [id, spec] of Object.entries(tables.lists)) {
    const el = entity(id)
    if (!el) continue
    const tpl = document.createElement('template')
    tpl.innerHTML = spec.html
    const state: ListState = { id, el, spec, tpl, rows: new Map(), records: new Map() }
    lists.set(el, state)
    byId.set(id, state)
  }
  ;(window as unknown as Record<string, unknown>)['__morgana_rowRecord'] = (list: string, key: string) => byId.get(list)?.records.get(key)

  const resolveField = (raw: string, rec: unknown): unknown => {
    const record = rec !== null && typeof rec === 'object' ? rec : { value: rec }
    const whole = /^\*([A-Za-z_$][\w$]*(?:\.[\w$]+)*)$/.exec(raw)
    if (whole) return getPath(record, whole[1] as string)
    return raw.replace(/\*([A-Za-z_$][\w$]*(?:\.[\w$]+)*)/g, (_m, path: string) => {
      const v = getPath(record, path)
      return v === undefined || v === null ? '' : String(v)
    })
  }
  const parts = (row: HTMLElement): HTMLElement[] => [row, ...Array.from(row.querySelectorAll<HTMLElement>('[data-tpl]'))]
  const fill = (list: ListState, row: HTMLElement, rec: unknown): void => {
    for (const el of parts(row)) {
      const fields = list.spec.fields[el.getAttribute('data-tpl') ?? '']
      if (!fields) continue
      for (const [prop, raw] of Object.entries(fields)) {
        try { writeElementProp(el, prop, resolveField(raw, rec)) } catch (e) { console.error('[Morgana] list row field failed:', e) }
      }
    }
  }
  const stamp = (list: ListState, key: string, rec: unknown): HTMLElement => {
    const row = (list.tpl.content.firstElementChild as HTMLElement).cloneNode(true) as HTMLElement
    for (const el of [row, ...Array.from(row.querySelectorAll<HTMLElement>('[data-entity]'))]) {
      const tid = el.getAttribute('data-entity') as string
      el.setAttribute('data-tpl', tid)
      el.setAttribute('data-entity', `${list.id}.${key}.${tid}`)
    }
    row.setAttribute('data-row-list', list.id)
    row.setAttribute('data-row-key', key)
    fill(list, row, rec)
    return row
  }
  const renderList = (list: ListState, value: unknown): void => {
    const items = Array.isArray(value) ? value : []
    const keyField = list.spec.key
    const next: Array<[string, unknown]> = items.map((rec, i) => {
      const k = keyField && rec && typeof rec === 'object' ? (rec as Record<string, unknown>)[keyField] : undefined
      return [String(k ?? i), rec]
    })
    const keep = new Set(next.map(([k]) => k))
    for (const [k, row] of list.rows) {
      if (keep.has(k)) continue
      row.el.remove()
      list.rows.delete(k)
      list.records.delete(k)
    }
    let prev: HTMLElement | null = null
    for (const [k, rec] of next) {
      const json = JSON.stringify(rec) ?? ''
      let row = list.rows.get(k)
      if (!row) {
        row = { el: stamp(list, k, rec), json }
        list.rows.set(k, row)
      } else if (row.json !== json) {
        fill(list, row.el, rec)
        row.json = json
      }
      list.records.set(k, rec)
      const want: ChildNode | null = prev ? prev.nextSibling : list.el.firstChild
      if (row.el !== want) list.el.insertBefore(row.el, want)
      prev = row.el
    }
  }

  // Every bound value lands here: a list re-stamps, anything else is a prop.
  ;(window as unknown as Record<string, unknown>)['__morgana_writeBound'] = (el: HTMLElement, prop: string, value: unknown): boolean => {
    const list = lists.get(el)
    if (list && (prop === '*' || prop === 'data')) {
      renderList(list, value)
      return true
    }
    if (prop === '*') prop = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' ? 'value' : 'text'
    try { writeElementProp(el, prop, value ?? '') } catch (e) { console.error('[Morgana] binding failed:', e) }
    return true
  }

  // ── fields bound to `value` write their state as you type ──
  document.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement | null
    const spec = el?.getAttribute?.('data-bind')
    if (!el || !spec) return
    for (const pair of spec.split(';')) {
      const i = pair.indexOf(':')
      if (i > 0 && pair.slice(0, i) === 'value') deps.commitMany({ [pair.slice(i + 1)]: el.value })
    }
  })

  // ── keys: `key:Escape`, `key:Mod+Enter` — Mod is ⌘ or Ctrl ──
  document.addEventListener('keydown', (e) => {
    if (e.isComposing) return
    const k = e.key.length === 1 ? e.key.toUpperCase() : e.key
    if (k === 'Control' || k === 'Meta' || k === 'Shift' || k === 'Alt') return
    const combo = `${e.metaKey || e.ctrlKey ? 'Mod+' : ''}${e.altKey ? 'Alt+' : ''}${e.shiftKey ? 'Shift+' : ''}${k}`
    const name = `key:${combo}`
    if (!deps.hasPageHandler(name)) return
    e.preventDefault()
    const target = (e.target as Element | null)?.closest?.('[data-entity]') ?? null
    deps.dispatchPageEvent(name, originOf(target), target, { key: e.key, combo })
  })

  // ── files: dragged onto an object that accepts them, or picked ──
  const fileList = (files: FileList | null | undefined) =>
    Array.from(files ?? []).map((f) => {
      // `url` reads the file itself (`await fetch(file.url)`); `preview` is set for images.
      let url: string | undefined
      try { url = URL.createObjectURL(f) } catch { /* no url */ }
      const preview = url && /^image\//.test(f.type) ? url : undefined
      return { name: f.name, size: f.size, type: f.type, ...(url ? { url } : {}), ...(preview ? { preview } : {}) }
    })
  const isFileDrag = (e: DragEvent): boolean => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')
  const zoneOf = (e: Event): HTMLElement | null => (e.target as Element | null)?.closest?.<HTMLElement>('[data-accepts-files]') ?? null
  const depth = new WeakMap<HTMLElement, number>()
  const clearZones = (): void => {
    document.querySelectorAll<HTMLElement>('[data-accepts-files][data-dragover]').forEach((z) => { z.removeAttribute('data-dragover'); depth.set(z, 0) })
  }
  document.addEventListener('dragenter', (e) => {
    const zone = zoneOf(e)
    if (!zone || !isFileDrag(e)) return
    e.preventDefault()
    depth.set(zone, (depth.get(zone) ?? 0) + 1)
    zone.setAttribute('data-dragover', '')
  })
  document.addEventListener('dragover', (e) => { if (zoneOf(e) && isFileDrag(e)) e.preventDefault() })
  document.addEventListener('dragleave', (e) => {
    const zone = zoneOf(e)
    if (!zone || !isFileDrag(e)) return
    const d = Math.max(0, (depth.get(zone) ?? 0) - 1)
    depth.set(zone, d)
    if (d === 0) zone.removeAttribute('data-dragover')
  })
  document.addEventListener('drop', (e) => {
    const zone = zoneOf(e)
    clearZones()
    if (!zone || !isFileDrag(e)) return
    e.preventDefault()
    deps.dispatchPageEvent('filesAdded', originOf(zone), zone, { files: fileList(e.dataTransfer?.files) })
  })
  window.addEventListener('dragend', clearZones)
  const pickers = new Map<string, HTMLInputElement>()
  document.addEventListener('click', (e) => {
    const opener = (e.target as Element | null)?.closest?.('[data-browse-files]')
    if (!opener) return
    const id = opener.getAttribute('data-browse-files') as string
    let input = pickers.get(id)
    if (!input) {
      input = document.createElement('input')
      input.type = 'file'
      input.multiple = true
      input.hidden = true
      input.addEventListener('change', () => {
        const zone = entity(id)
        deps.dispatchPageEvent('filesAdded', id, zone, { files: fileList(input!.files) })
        input!.value = ''
      })
      document.body.appendChild(input)
      pickers.set(id, input)
    }
    input.click()
  })

  // ── hand drags: a handle moves its object sideways, `released` says how far ──
  document.addEventListener('pointerdown', (e) => {
    const handle = (e.target as Element | null)?.closest?.<HTMLElement>('[data-drags]')
    if (!handle) return
    const target = entity(handle.getAttribute('data-drags') as string)
    if (!target) return
    const sx = e.clientX
    let dx = 0
    handle.setPointerCapture?.(e.pointerId)
    target.setAttribute('data-drag-active', '')
    const move = (ev: PointerEvent): void => {
      dx = Math.max(0, ev.clientX - sx)
      target.style.setProperty('--drag-x', `${dx}px`)
    }
    const end = (): void => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', end)
      handle.removeEventListener('pointercancel', end)
      target.removeAttribute('data-drag-active')
      target.style.removeProperty('--drag-x')
      deps.dispatchPageEvent('released', originOf(handle), handle, { dx, width: target.offsetWidth })
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', end)
    handle.addEventListener('pointercancel', end)
  })
}
