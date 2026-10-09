/**
 * Data handle methods: table, list/lister, chart.
 *
 * The table methods operate on the rendered rows rather than a parallel data
 * copy, so sorting and selection cannot disagree with what is on screen.
 */
import { extend, type HandleCtx } from './shared'
import { chartSvg } from '../../chart-svg'

/**
 * Repaint a chart element from a spec — the runtime half of the shared
 * builder. Used by the setKind/setSeries/setLabels/setPalette methods and
 * by the generic set() path (runtime applyProp).
 */
export function repaintChartEl(el: HTMLElement, spec: { kind?: string; series?: unknown; labels?: unknown; palette?: unknown }): void {
  const svg = chartSvg({ kind: spec.kind, series: spec.series, labels: spec.labels, palette: spec.palette })
  el.innerHTML = svg === '' ? '<div data-part="empty">No data</div>' : svg
}

type Row = Record<string, unknown>

function tableMethods(ctx: HandleCtx): Record<string, unknown> {
  const table = (): HTMLTableElement | null => (ctx.el?.tagName === 'TABLE' ? (ctx.el as HTMLTableElement) : null)

  /** Read the rendered rows back out as records, honouring column data-column. */
  const readRows = (): Row[] => {
    const t = table()
    if (!t?.tBodies[0]) return []
    const cols = Array.from(t.querySelectorAll('thead th[data-column]')).map((th) => th.getAttribute('data-column') ?? '')
    return Array.from(t.tBodies[0].rows)
      .filter((tr) => tr.getAttribute('data-part') !== 'select-cell')
      .map((tr, i) => {
        const rec: Row = { __key: tr.getAttribute('data-key') ?? String(i) }
        if (cols.length) {
          Array.from(tr.cells).forEach((td, j) => {
            const key = cols[j]
            if (key) rec[key] = td.textContent ?? ''
          })
        } else {
          Array.from(tr.cells).forEach((td, j) => {
            rec[`col${j}`] = td.textContent ?? ''
          })
        }
        return rec
      })
  }

  const writeRows = (rows: Row[]): void => {
    const t = table()
    if (!t?.tBodies[0]) return
    const cols = Array.from(t.querySelectorAll('thead th[data-column]')).map((th) => th.getAttribute('data-column') ?? '')
    const template = t.tBodies[0].rows[0]
    t.tBodies[0].innerHTML = ''
    rows.forEach((rec, i) => {
      const tr = t.tBodies[0]!.insertRow()
      tr.setAttribute('data-row', String(i))
      tr.setAttribute('data-key', String(rec['__key'] ?? i))
      if (ctx.getProp('selection') && (ctx.getProp('selection') as { mode?: string }).mode) {
        const mode = (ctx.getProp('selection') as { mode?: string }).mode
        if (mode === 'single' || mode === 'multiple') {
          const td = tr.insertCell()
          td.setAttribute('data-part', 'select-cell')
          const input = document.createElement('input')
          input.type = mode === 'single' ? 'radio' : 'checkbox'
          input.setAttribute('data-part', 'select')
          input.setAttribute('data-key', String(rec['__key'] ?? i))
          input.setAttribute('aria-label', 'Select row')
          td.appendChild(input)
        }
      }
      for (const key of cols) {
        tr.insertCell().textContent = String(rec[key] ?? '')
      }
    })
    void template
  }

  const sort = (key: string, direction: 'asc' | 'desc' = 'asc'): void => {
    const dir = direction === 'desc' ? -1 : 1
    const rows = readRows().sort((a, b) => {
      const av = a[key]
      const bv = b[key]
      const an = parseFloat(String(av))
      const bn = parseFloat(String(bv))
      const cmp =
        !Number.isNaN(an) && !Number.isNaN(bn)
          ? an - bn
          : String(av ?? '').localeCompare(String(bv ?? ''))
      return cmp * dir
    })
    ctx.setProp('sorting', { key, direction })
    writeRows(rows)
    // Update the header arrows to match.
    const t = table()
    for (const th of Array.from(t?.querySelectorAll('th[data-sortable]') ?? [])) {
      th.removeAttribute('data-sort-dir')
      const arrow = th.querySelector('[data-part="sort-arrow"]')
      if (arrow) arrow.textContent = '\u21C5'
    }
    const target = t?.querySelector(`th[data-column="${CSS.escape(key)}"]`)
    target?.setAttribute('data-sort-dir', dir === 1 ? 'asc' : 'desc')
    const arrow = target?.querySelector('[data-part="sort-arrow"]')
    if (arrow) arrow.textContent = dir === 1 ? '\u25B2' : '\u25BC'
  }

  const selectedKeys = (): string[] =>
    Array.from(table()?.querySelectorAll<HTMLInputElement>('input[data-part="select"]:checked') ?? []).map((i) => i.getAttribute('data-key') ?? '')

  const select = (key: string | string[]): void => {
    const mode = (ctx.getProp('selection') as { mode?: string } | undefined)?.mode ?? 'multiple'
    const wanted = new Set(Array.isArray(key) ? key.map(String) : [String(key)])
    for (const box of Array.from(table()?.querySelectorAll<HTMLInputElement>('input[data-part="select"]') ?? [])) {
      const k = box.getAttribute('data-key') ?? ''
      const on = wanted.has(k) || (mode === 'single' && wanted.size === 1 && box.checked)
      box.checked = on
      box.closest('tr')?.setAttribute('data-selected', on ? 'true' : 'false')
    }
    ctx.emit('selected', { keys: selectedKeys() })
  }

  const paginate = (page: number): void => {
    const t = table()
    if (!t?.tBodies[0]) return
    const rows = t.tBodies[0].rows
    const bar = ctx.el?.parentElement?.querySelector('[data-part="pagination"]')
    const per = bar ? Array.from(bar.previousElementSibling?.querySelectorAll('tr') ?? []).filter((r) => (r as HTMLElement).style.display !== 'none').length : 0
    const visiblePer = per > 0 ? per : rows.length
    const pages = Math.max(1, Math.ceil(rows.length / Math.max(1, visiblePer)))
    const size = Math.max(1, Math.ceil(rows.length / pages))
    const next = Math.max(1, Math.min(pages, page))
    Array.from(rows).forEach((r: HTMLTableRowElement, i: number) => {
      ;(r as HTMLElement).style.display = i >= (next - 1) * size && i < next * size ? '' : 'none'
    })
    for (const b of Array.from(bar?.querySelectorAll<HTMLButtonElement>('button[data-page]') ?? [])) {
      const p = b.getAttribute('data-page')
      if (p === 'prev') b.disabled = next <= 1
      else if (p === 'next') b.disabled = next >= pages
      else if (p !== null && p !== String(next)) b.removeAttribute('data-current')
    }
    const cur = bar?.querySelector<HTMLElement>('button[data-current="true"]')
    if (cur && cur.getAttribute('data-page') !== String(next)) {
      cur.removeAttribute('data-current')
      bar?.querySelector(`button[data-page="${next}"]`)?.setAttribute('data-current', 'true')
    }
    ctx.setProp('pagination', { ...(ctx.getProp('pagination') as object), page: next })
  }

  return {
    getData: readRows,
    getRows: readRows,
    setData: (rows: Row[]) => {
      ctx.setProp('rows', rows)
      ctx.setProp('data', rows)
      writeRows(rows)
    },
    getColumns: () =>
      Array.from(table()?.querySelectorAll('thead th[data-column]') ?? []).map((th) => ({
        key: th.getAttribute('data-column') ?? '',
        label: th.textContent?.replace(/[\u21C5\u25B2\u25BC]/g, '').trim() ?? '',
      })),
    setColumns: (columns: Array<{ key: string; label: string; sortable?: boolean }>) => {
      ctx.setProp('columns', columns)
      const t = table()
      if (!t) return
      const thead = t.querySelector('thead tr')
      if (!thead) return
      const keepSelect = thead.querySelector('[data-part="select-cell"]')
      thead.innerHTML = keepSelect ? keepSelect.outerHTML : ''
      for (const c of columns) {
        const th = document.createElement('th')
        th.setAttribute('data-column', c.key)
        if (c.sortable) th.setAttribute('data-sortable', 'true')
        th.textContent = c.label
        if (c.sortable) {
          const arrow = document.createElement('span')
          arrow.setAttribute('data-part', 'sort-arrow')
          arrow.textContent = '\u21C5'
          th.appendChild(arrow)
        }
        thead.appendChild(th)
      }
    },
    sort,
    clearSort: () => {
      ctx.setProp('sorting', {})
      const t = table()
      for (const th of Array.from(t?.querySelectorAll('th[data-sortable]') ?? [])) {
        th.removeAttribute('data-sort-dir')
        const arrow = th.querySelector('[data-part="sort-arrow"]')
        if (arrow) arrow.textContent = '\u21C5'
      }
    },
    filter: (key: string, value: unknown) => {
      const rows = readRows()
      const kept = rows.filter((r) => String(r[key] ?? '') === String(value ?? ''))
      const t = table()
      if (!t?.tBodies[0]) return
      const all = Array.from(t.tBodies[0].rows)
      all.forEach((tr, i) => {
        ;(tr as HTMLElement).style.display = i < kept.length ? '' : 'none'
      })
      ctx.emit('filtered', { key, value, count: kept.length })
    },
    setSearch: (query: string) => {
      const q = String(query ?? '').toLowerCase()
      const t = table()
      if (!t?.tBodies[0]) return
      for (const tr of Array.from(t.tBodies[0].rows)) {
        ;(tr as HTMLElement).style.display = !q || (tr.textContent ?? '').toLowerCase().includes(q) ? '' : 'none'
      }
    },
    select,
    deselect: (key: string | string[]) => {
      const drop = new Set(Array.isArray(key) ? key.map(String) : [String(key)])
      for (const box of Array.from(table()?.querySelectorAll<HTMLInputElement>('input[data-part="select"]') ?? [])) {
        if (drop.has(box.getAttribute('data-key') ?? '')) {
          box.checked = false
          box.closest('tr')?.setAttribute('data-selected', 'false')
        }
      }
      ctx.emit('selected', { keys: selectedKeys() })
    },
    selectAll: () => select(Array.from(table()?.querySelectorAll('input[data-part="select"]') ?? []).map((i) => i.getAttribute('data-key') ?? '')),
    clearSelection: () => select([]),
    getSelectedKeys: selectedKeys,
    getSelectedRows: () => {
      const keys = new Set(selectedKeys())
      return readRows().filter((r) => keys.has(String(r['__key'])))
    },
    setPage: paginate,
    nextPage: () => {
      const cur = Number((ctx.getProp('pagination') as { page?: number } | undefined)?.page ?? 1)
      paginate(cur + 1)
    },
    prevPage: () => {
      const cur = Number((ctx.getProp('pagination') as { page?: number } | undefined)?.page ?? 1)
      paginate(cur - 1)
    },
    setPageSize: (size: number) => {
      const t = table()
      if (!t?.tBodies[0]) return
      for (const tr of Array.from(t.tBodies[0].rows)) {
        ;(tr as HTMLElement).style.display = Array.prototype.indexOf.call(tr.parentNode?.children ?? [], tr) < size ? '' : 'none'
      }
      ctx.setProp('pagination', { ...(ctx.getProp('pagination') as object), pageSize: size })
    },
    setDensity: (density: string) => {
      ctx.setProp('density', density)
      if (ctx.el) ctx.el.setAttribute('data-density', density)
    },
    setVariant: (variant: string) => {
      ctx.setProp('variant', variant)
      if (ctx.el) ctx.el.setAttribute('data-variant', variant)
    },
    setLoading: (loading: boolean) => {
      ctx.setProp('loading', loading)
      if (ctx.el) ctx.el.setAttribute('data-loading', loading ? 'true' : 'false')
    },
    isLoading: () => ctx.el?.getAttribute('data-loading') === 'true',
    getPaginatedRows: () =>
      Array.from(table()?.tBodies[0]?.rows ?? [])
        .filter((r) => (r as HTMLElement).style.display !== 'none')
        .map((r, i) => ({ __key: r.getAttribute('data-key') ?? String(i) })),
    getFilteredRows: () =>
      Array.from(table()?.tBodies[0]?.rows ?? [])
        .filter((r) => (r as HTMLElement).style.display !== 'none')
        .map((r, i) => ({ __key: r.getAttribute('data-key') ?? String(i) })),
    exportData: (format: 'json' | 'csv' = 'json'): string => {
      const rows = readRows()
      if (format === 'csv') {
        const cols = Array.from(table()?.querySelectorAll('thead th[data-column]') ?? []).map((th) => th.getAttribute('data-column') ?? '')
        const head = cols.join(',')
        const body = rows.map((r) => cols.map((c) => JSON.stringify(String(r[c] ?? ''))).join(',')).join('\n')
        return `${head}\n${body}`
      }
      return JSON.stringify(rows, null, 2)
    },
  }
}

function mediaMethods(ctx: HandleCtx): Record<string, unknown> {
  const media = (): HTMLMediaElement | null => {
    const el = ctx.el
    if (!el) return null
    if (el.tagName === 'VIDEO' || el.tagName === 'AUDIO') return el as unknown as HTMLMediaElement
    return el.querySelector('video,audio') as unknown as HTMLMediaElement | null
  }
  return {
    play: () => {
      try {
        const p = media()?.play?.() as unknown as { catch?: (fn: () => void) => void } | undefined
        // Empty-src playback rejects by design — a sourceless demo player
        // must not turn an expected rejection into console noise.
        p?.catch?.(() => {})
      } catch {
        // No media element (detached handle): nothing to play.
      }
    },
    pause: () => {
      media()?.pause?.()
    },
    setSrc: (src: string) => {
      ctx.setProp('src', src)
      const m = media()
      if (m) {
        m.setAttribute('src', String(src))
        m.load?.()
      }
    },
    setMuted: (muted: boolean) => {
      ctx.setProp('muted', muted)
      const m = media()
      if (m) m.muted = muted
    },
  }
}

function breadcrumbsMethods(ctx: HandleCtx): Record<string, unknown> {
  const esc = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  return {
    setItems: (items: Array<{ label?: string; value?: string; href?: string }>) => {
      ctx.setProp('items', items)
      if (!ctx.el) return
      const sep = esc(String(ctx.getProp('separator') ?? '/'))
      const list = Array.isArray(items) ? items : []
      ctx.el.innerHTML = list
        .map((item, i) => {
          if (!item || typeof item !== 'object') return ''
          const label = esc(String(item.label ?? item.value ?? ''))
          const isLast = i === list.length - 1
          const href = !isLast && item.href ? String(item.href) : null
          return (
            (i > 0 ? `<span data-part="separator" aria-hidden="true">${sep}</span>` : '') +
            '<span data-part="crumb" data-current="false">' +
            (href ? `<a href="${esc(href)}">${label}</a>` : `<span>${label}</span>`) +
            '</span>'
          )
        })
        .join('')
    },
    setSeparator: (separator: string) => {
      ctx.setProp('separator', separator)
      if (!ctx.el) return
      ctx.el.setAttribute('data-separator', String(separator))
      for (const node of Array.from(ctx.el.querySelectorAll('[data-part="separator"]'))) {
        node.textContent = String(separator)
      }
    },
  }
}

function listMethods(ctx: HandleCtx): Record<string, unknown> {
  const items = (): Element[] => Array.from(ctx.el?.children ?? [])
  return {
    count: () => items().length,
    append: (record: Row) => {
      ctx.setProp('rows', [...(((ctx.getProp('rows') as Row[]) ?? [])), record])
      const li = document.createElement('li')
      li.setAttribute('data-part', 'item')
      li.textContent = Object.values(record ?? {}).join(' ')
      ctx.el?.appendChild(li)
      ctx.emit('appended', record)
    },
    patch: (record: Row) => {
      const last = items()[items().length - 1]
      if (last) last.textContent = Object.values(record ?? {}).join(' ')
      ctx.emit('patched', record)
    },
    clear: () => {
      if (ctx.el) ctx.el.innerHTML = ''
      ctx.setProp('rows', [])
    },
    lock: () => ctx.setProp('locked', true),
    unlock: () => ctx.setProp('locked', false),
    isLocked: () => ctx.getProp('locked') === true,
  }
}

function chartMethods(ctx: HandleCtx): Record<string, unknown> {
  /**
   * `ChartStateView` (sdk/handles.ts) — 12 fields, previously never
   * constructed anywhere. Built from the chart's declared props so both the
   * svg renderer and a future chartjs backend read the same shape.
   */
  const chartState = () => {
    const p = ctx.getProp as (k: string) => unknown
    const kind = (p('chartKind') ?? p('kind') ?? 'bar') as string
    const labels = Array.isArray(p('labels')) ? (p('labels') as string[]) : []
    const seriesProp = p('series')
    const series: number[][] = Array.isArray(seriesProp)
      ? (seriesProp as unknown[]).map((s) => (Array.isArray(s) ? (s as number[]) : [Number(s) || 0]))
      : []
    const points = Array.isArray(p('points'))
      ? (p('points') as Array<Record<string, unknown>>).map((pt) => ({
          x: Number(pt['x'] ?? 0),
          y: Number(pt['y'] ?? 0),
          r: typeof pt['r'] === 'number' ? pt['r'] : undefined,
          c: typeof pt['c'] === 'number' ? pt['c'] : undefined,
        }))
      : []
    return {
      kind,
      series,
      labels,
      points,
      orientation: (p('orientation') === 'h' ? 'h' : 'v') as 'v' | 'h',
      stacked: p('stacked') === true,
      innerRadius: Number(p('innerRadius') ?? 0),
      smooth: p('smooth') === true,
      markers: p('markers') === true,
      palette: Array.isArray(p('palette')) ? (p('palette') as string[]) : [],
      axes: {
        x: p('showXAxis') !== false,
        y: p('showYAxis') !== false,
      },
      legend: ((p('legend') as string) ?? 'none') as 'none' | 'top' | 'bottom' | 'right',
      gridlines: ((p('gridlines') as string) ?? 'none') as 'none' | 'x' | 'y' | 'both',
    }
  }
  /**
   * Repaint the SVG from current props — the same builder the compile lane
   * stamped (chart-svg.ts), so setKind/setSeries never disagree with build.
   * An empty chart keeps its "No data" placeholder instead of going blank.
   */
  const repaint = (): void => {
    if (!ctx.el) return
    repaintChartEl(ctx.el, chartState() as { kind: string; series: unknown; labels: unknown; palette: unknown })
  }
  return {
    chartState,
    repaint,
    setKind: (kind: string) => {
      ctx.setProp('chartKind', kind)
      repaint()
    },
    setLabels: (labels: string[]) => {
      ctx.setProp('labels', labels)
      repaint()
    },
    setSeries: (series: number[][]) => {
      ctx.setProp('series', series)
      repaint()
    },
    setPalette: (palette: string[]) => {
      ctx.setProp('palette', palette)
      repaint()
    },
    getRenderer: () => 'svg' as const,
    download: (format: 'svg' | 'png' = 'svg'): void => {
      const svg = ctx.el?.querySelector('svg')
      if (!svg) return
      const markup = new XMLSerializer().serializeToString(svg)
      const blob = new Blob([markup], { type: 'image/svg+xml' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `chart.${format}`
      a.click()
      URL.revokeObjectURL(url)
    },
  }
}

function stepsMethods(ctx: HandleCtx): Record<string, unknown> {
  const items = (): Array<Record<string, unknown>> =>
    Array.isArray(ctx.getProp('items')) ? (ctx.getProp('items') as Array<Record<string, unknown>>) : []
  const paint = (current: number): void => {
    const n = items().length
    const c = n === 0 ? 0 : Math.max(0, Math.min(n - 1, Math.floor(current) || 0))
    ctx.setProp('current', c)
    if (!ctx.el) return
    ctx.el.setAttribute('data-current', String(c))
    for (const node of Array.from(ctx.el.querySelectorAll('[data-part="step"]'))) {
      const idx = Number(node.getAttribute('data-step-index') ?? -1)
      const state = idx < c ? 'done' : idx === c ? 'current' : 'todo'
      node.setAttribute('data-state', state)
      const marker = node.querySelector('[data-part="marker"]')
      if (marker) marker.textContent = idx < c ? '✓' : String(idx + 1)
    }
  }
  return {
    getCurrent: () => Number(ctx.getProp('current') ?? 0),
    setCurrent: (index: number) => {
      paint(Number(index))
      ctx.emit('changed', { current: Number(ctx.getProp('current') ?? 0) })
    },
    next: () => {
      paint(Number(ctx.getProp('current') ?? 0) + 1)
      ctx.emit('changed', { current: Number(ctx.getProp('current') ?? 0) })
    },
    prev: () => {
      paint(Number(ctx.getProp('current') ?? 0) - 1)
      ctx.emit('changed', { current: Number(ctx.getProp('current') ?? 0) })
    },
    setItems: (next: Array<Record<string, unknown>>) => {
      ctx.setProp('items', next)
      paint(Number(ctx.getProp('current') ?? 0))
    },
  }
}

function timelineMethods(ctx: HandleCtx): Record<string, unknown> {
  const esc = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  return {
    setItems: (items: Array<{ title?: string; time?: string; content?: string }>) => {
      ctx.setProp('items', items)
      if (!ctx.el) return
      ctx.el.innerHTML = (Array.isArray(items) ? items : [])
        .map((item) => {
          if (!item || typeof item !== 'object') return ''
          return (
            '<div data-part="event"><span data-part="dot"></span><div data-part="event-body">' +
            `<div data-part="event-title">${esc(String(item.title ?? ''))}</div>` +
            (item.time ? `<div data-part="event-time">${esc(String(item.time))}</div>` : '') +
            (item.content ? `<div data-part="event-content">${esc(String(item.content))}</div>` : '') +
            '</div></div>'
          )
        })
        .join('')
    },
  }
}

function statMethods(ctx: HandleCtx): Record<string, unknown> {
  const write = (part: string, prop: string, value: string): void => {
    ctx.setProp(prop, value)
    const node = ctx.el?.querySelector(`[data-part="${part}"]`)
    if (node) node.textContent = String(value ?? '')
  }
  return {
    setValue: (value: string) => write('stat-value', 'value', value),
    setLabel: (label: string) => write('stat-label', 'label', label),
    setDelta: (delta: string, trend?: string) => {
      const t = trend === 'down' ? 'down' : trend === 'flat' ? 'flat' : 'up'
      ctx.setProp('delta', delta)
      ctx.setProp('trend', t)
      if (!ctx.el) return
      const node = ctx.el.querySelector('[data-part="stat-delta"]')
      if (node) {
        node.setAttribute('data-trend', t)
        node.textContent = `${t === 'down' ? '↓' : t === 'flat' ? '→' : '↑'}${String(delta ?? '')}`
      }
    },
  }
}

function tagMethods(ctx: HandleCtx): Record<string, unknown> {
  return {
    setLabel: (label: string) => {
      ctx.setProp('label', label)
      const node = ctx.el?.querySelector('[data-part="tag-label"]')
      if (node) node.textContent = String(label ?? '')
    },
    setVariant: (variant: string) => {
      ctx.setProp('variant', variant)
      ctx.el?.setAttribute('data-variant', String(variant))
    },
    close: () => {
      ctx.el?.remove()
      ctx.emit('closed', {})
    },
  }
}

function treeMethods(ctx: HandleCtx): Record<string, unknown> {
  const esc = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const nodes = (): Element[] => Array.from(ctx.el?.querySelectorAll('[data-part="node"]') ?? [])
  const setExpanded = (node: Element, open: boolean): void => {
    node.setAttribute('data-expanded', open ? 'true' : 'false')
    const caret = node.querySelector('[data-part="caret"]')
    caret?.setAttribute('aria-expanded', open ? 'true' : 'false')
    const kids = Array.from(node.children).find((c) => (c as Element).getAttribute?.('data-part') === 'children') as Element | undefined
    if (kids) {
      if (open) kids.removeAttribute('hidden')
      else kids.setAttribute('hidden', '')
    }
  }
  const byKey = (key: string): Element | undefined =>
    nodes().find((n) => n.getAttribute('data-node-key') === String(key))
  const expandedKeys = (): string[] =>
    nodes()
      .filter((n) => n.getAttribute('data-expanded') === 'true')
      .map((n) => n.getAttribute('data-node-key') ?? '')
  return {
    expand: (key?: string) => {
      if (key === undefined) {
        for (const n of nodes()) setExpanded(n, true)
      } else {
        const t = byKey(key)
        if (t) setExpanded(t, true)
      }
      ctx.emit('changed', { expanded: expandedKeys() })
    },
    collapse: (key?: string) => {
      if (key === undefined) {
        for (const n of nodes()) setExpanded(n, false)
      } else {
        const t = byKey(key)
        if (t) setExpanded(t, false)
      }
      ctx.emit('changed', { expanded: expandedKeys() })
    },
    toggle: (key: string) => {
      const t = byKey(key)
      if (!t) return
      setExpanded(t, t.getAttribute('data-expanded') !== 'true')
      ctx.emit('changed', { expanded: expandedKeys() })
    },
    select: (key: string) => {
      ctx.setProp('selectedKey', key)
      for (const label of Array.from(ctx.el?.querySelectorAll('[data-part="node-label"]') ?? [])) {
        const host = label.closest('[data-part="node"]')
        const on = host?.getAttribute('data-node-key') === String(key)
        if (on) label.setAttribute('data-selected', 'true')
        else label.removeAttribute('data-selected')
      }
      ctx.emit('selected', { key: String(key) })
    },
    getSelected: () => {
      const v = ctx.getProp('selectedKey')
      return typeof v === 'string' && v !== '' ? v : undefined
    },
    getExpanded: () => expandedKeys(),
  }
}

const BY_KIND: Record<string, (ctx: HandleCtx) => Record<string, unknown>> = {
  table: tableMethods,
  list: listMethods,
  lister: listMethods,
  chart: chartMethods,
  video: mediaMethods,
  audio: mediaMethods,
  breadcrumbs: breadcrumbsMethods,
  steps: stepsMethods,
  timeline: timelineMethods,
  stat: statMethods,
  tag: tagMethods,
  treeView: treeMethods,
}

export function extendData(ctx: HandleCtx): void {
  const build = BY_KIND[ctx.kind]
  if (build) extend(ctx, build(ctx))
}
