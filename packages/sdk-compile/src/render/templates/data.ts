/**
 * Data templates: table, list (+stamping), chart, progress.
 */
import { baseAttrs, carryProps, escAttr, escHtml, type RenderNode } from '../html';
import { renderNode } from '../node';
import type { ProjectIR } from '../../ir';

interface TableColumn {
  key: string
  label: string
  width?: string | number
  sortable?: boolean
  filterable?: boolean
  align?: string
  format?: string | ((value: unknown, row: unknown) => unknown)
}

function formatCellValue(format: unknown, value: unknown): string {
  if (typeof format === 'function') return escHtml(String(value ?? ''))
  switch (format) {
    case 'number': {
      const n = Number(value)
      return escHtml(Number.isFinite(n) ? String(n) : String(value ?? ''))
    }
    case 'currency': {
      const n = Number(value)
      return escHtml(Number.isFinite(n) ? `$${n.toFixed(2)}` : String(value ?? ''))
    }
    case 'badge':
      return `<span data-part="cell-badge">${escHtml(String(value ?? ''))}</span>`
    case 'date': {
      const d = value instanceof Date ? value : new Date(String(value ?? ''))
      return escHtml(Number.isNaN(d.getTime()) ? String(value ?? '') : d.toISOString().slice(0, 10))
    }
    case 'progress': {
      const n = Math.max(0, Math.min(100, Number(value) || 0))
      return `<span data-part="cell-bar"><span data-part="cell-fill" style="width:${n}%"></span></span>`
    }
    case 'boolean':
      return value ? '✓' : '—'
    default:
      return escHtml(String(value ?? ''))
  }
}

export function renderTable(ir: ProjectIR, node: RenderNode): string {
  const props = node.props
  const attrList = baseAttrs(node)
  // selection / stickyHeader / loading / variant / density were declared on
  // TableProps but never emitted, so declaring them changed nothing.
  const selection = (props['selection'] ?? null) as null | { mode?: string; selectedKeys?: string[] }
  const selectionMode = selection && typeof selection.mode === 'string' ? selection.mode : 'none'
  if (selectionMode !== 'none') attrList.push(`data-select-mode="${escAttr(selectionMode)}"`)
  if (props['stickyHeader'] === true) attrList.push('data-sticky-header="true"')
  if (props['loading'] === true) attrList.push('data-loading="true"')
  if (typeof props['variant'] === 'string') attrList.push(`data-variant="${escAttr(props['variant'])}"`)
  if (typeof props['density'] === 'string') attrList.push(`data-density="${escAttr(props['density'])}"`)
  const selectedKeys = new Set(
    selection && Array.isArray(selection.selectedKeys) ? selection.selectedKeys.map(String) : [],
  )
  const skip = new Set([
    'id', 'name', 'placement', 'data', 'address', 'app',
    'columns', 'rows', 'data', 'pagination', 'sorting', 'filtering', 'selection',
    'caption', 'emptyText', 'stickyHeader', 'loading', 'variant', 'density',
  ])
  attrList.push(...carryProps(props, skip))

  const columns: TableColumn[] = Array.isArray(props['columns']) ? (props['columns'] as TableColumn[]) : []
  const rawRows: Array<Record<string, unknown>> = Array.isArray(props['rows'])
    ? (props['rows'] as Array<Record<string, unknown>>)
    : Array.isArray(props['data'])
      ? (props['data'] as Array<Record<string, unknown>>)
      : []

  // Filtering (static, at compile).
  const filtering = (props['filtering'] ?? {}) as { search?: string; columns?: Record<string, unknown> }
  let rows = rawRows.filter((row) => {
    if (typeof filtering.search === 'string' && filtering.search !== '') {
      const q = filtering.search.toLowerCase()
      const hit = Object.values(row).some((v) => String(v ?? '').toLowerCase().includes(q))
      if (!hit) return false
    }
    if (filtering.columns && typeof filtering.columns === 'object') {
      for (const [k, v] of Object.entries(filtering.columns)) {
        if (String(row[k] ?? '') !== String(v ?? '')) return false
      }
    }
    return true
  })

  // Sorting (static, at compile; client toggles re-sort live).
  const sorting = (props['sorting'] ?? {}) as { key?: string; direction?: string }
  if (sorting.key) {
    const dir = sorting.direction === 'desc' ? -1 : 1
    const key = sorting.key
    rows = [...rows].sort((a, b) => {
      const av = a[key]
      const bv = b[key]
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      return String(av ?? '').localeCompare(String(bv ?? '')) * dir
    })
  }

  // Pagination (static slice at compile; client pages live).
  const pagination = (props['pagination'] ?? null) as null | {
    enabled?: boolean
    page?: number
    pageSize?: number
    total?: number
    pageSizeOptions?: number[]
    style?: string
    position?: string
    showTotal?: boolean
  }
  const total = pagination && typeof pagination.total === 'number' ? pagination.total : rows.length
  const pageSize = pagination && typeof pagination.pageSize === 'number' && pagination.pageSize > 0 ? pagination.pageSize : rows.length || 1
  const page = pagination && typeof pagination.page === 'number' && pagination.page > 0 ? pagination.page : 1
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(page, totalPages)
  const visible = pagination && pagination.enabled !== false ? rows.slice((currentPage - 1) * pageSize, currentPage * pageSize) : rows

  const keys = columns.length > 0 ? columns.map((c) => String(c.key)) : Object.keys(rows[0] ?? {})
  const cols: TableColumn[] = columns.length > 0 ? columns : keys.map((k) => ({ key: k, label: k }))

  let html = `<table ${attrList.join(' ')}>`
  if (props['caption'] !== undefined && props['caption'] !== null && props['caption'] !== '') {
    html += `<caption>${escHtml(String(props['caption']))}</caption>`
  }
  html += '<thead><tr>'
  for (const col of cols) {
    const align = typeof col.align === 'string' ? ` data-align="${escAttr(col.align)}"` : ''
    const width = col.width !== undefined && col.width !== null && col.width !== '' ? ` style="width:${typeof col.width === 'number' ? `${col.width}px` : escAttr(String(col.width))}"` : ''
    const sortable = col.sortable ? ' data-sortable="true"' : ''
    // filterable drives a per-column filter input in the header.
    const filterable = col.filterable ? ' data-filterable="true"' : ''
    const active = sorting.key === col.key
    const arrow = col.sortable ? ` <span data-part="sort-arrow">${active ? (sorting.direction === 'desc' ? '▼' : '▲') : '⇅'}</span>` : ''
    html += `<th data-column="${escAttr(String(col.key))}"${align}${width}${sortable}${filterable}>${escHtml(String(col.label ?? col.key))}${arrow}`
    html += filterable ? `<input data-part="column-filter" data-column="${escAttr(String(col.key))}" type="text" placeholder="Filter" aria-label="Filter ${escAttr(String(col.label ?? col.key))}" />` : ''
    html += '</th>'
  }
  // Selection control column, one checkbox/radio per row.
  if (selectionMode === 'single' || selectionMode === 'multiple') {
    const type = selectionMode === 'single' ? 'radio' : 'checkbox'
    html += `<th data-part="select-cell"></th>`
  }
  html += '</tr></thead><tbody>'
  if (visible.length === 0) {
    const emptyText = props['emptyText'] !== undefined && props['emptyText'] !== null && props['emptyText'] !== '' ? String(props['emptyText']) : 'No data'
    const span = (cols.length || 1) + (selectionMode === 'none' ? 0 : 1)
    html += `<tr><td colspan="${span}">${escHtml(emptyText)}</td></tr>`
  } else {
    visible.forEach((row, i) => {
      // Row identity: the first declared id-ish key, else its index. Selection
      // is tracked by this key so a re-sort keeps the right rows selected.
      const keyCol = cols.find((c) => /(^|\.)id$/.test(String(c.key)))
      const rowKey = String(keyCol ? row[keyCol.key] : i)
      const isSelected = selectedKeys.has(rowKey)
      html += `<tr data-row="${i}" data-key="${escAttr(rowKey)}"${isSelected ? ' data-selected="true"' : ''}>`
      if (selectionMode === 'single' || selectionMode === 'multiple') {
        const type = selectionMode === 'single' ? 'radio' : 'checkbox'
        html += `<td data-part="select-cell"><input type="${type}" data-part="select" data-key="${escAttr(rowKey)}"${isSelected ? ' checked' : ''} aria-label="Select row" /></td>`
      }
      for (const col of cols) {
        const align = typeof col.align === 'string' ? ` data-align="${escAttr(col.align)}"` : ''
        const width = col.width !== undefined && col.width !== null && col.width !== '' ? ` style="width:${typeof col.width === 'number' ? `${col.width}px` : escAttr(String(col.width))}"` : ''
        html += `<td${align}${width}>${formatCellValue(col.format, row[col.key])}</td>`
      }
      html += '</tr>'
    })
  }
  html += '</tbody></table>'

  if (pagination && pagination.enabled !== false && totalPages > 1) {
    const position = typeof pagination.position === 'string' ? pagination.position : 'bottom'
    const style = typeof pagination.style === 'string' ? ` data-style="${escAttr(pagination.style)}"` : ''
    let bar = `<div data-part="pagination"${style}>`
    bar += `<button type="button" data-page="prev"${currentPage <= 1 ? ' disabled' : ''} aria-label="Previous page">‹</button>`
    for (let p = 1; p <= totalPages; p++) {
      bar += `<button type="button" data-page="${p}"${p === currentPage ? ' data-current="true"' : ''}>${p}</button>`
    }
    bar += `<button type="button" data-page="next"${currentPage >= totalPages ? ' disabled' : ''} aria-label="Next page">›</button>`
    if (pagination.showTotal === true) bar += `<span data-part="total">${total} total</span>`
    if (Array.isArray(pagination.pageSizeOptions) && pagination.pageSizeOptions.length > 0) {
      bar += `<label data-part="page-size">Rows <select data-page-size="${pageSize}">`
      for (const size of pagination.pageSizeOptions) {
        bar += `<option value="${escAttr(String(size))}"${Number(size) === pageSize ? ' selected' : ''}>${escHtml(String(size))}</option>`
      }
      bar += '</select></label>'
    }
    bar += '</div>'
    if (position === 'top') return bar + html
    if (position === 'both') return bar + html + bar
    return html + bar
  }
  return html
}

function lookupRecord(
  record: Record<string, unknown>,
  path: string,
  fields?: Record<string, string>,
): unknown {
  const dot = path.indexOf('.')
  const first = dot < 0 ? path : path.slice(0, dot)
  const mapped = fields?.[first] ?? first
  const full = dot < 0 ? mapped : `${mapped}${path.slice(dot)}`
  return full.split('.').reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], record)
}

/** Resolve `*field` references in a stamped prop: whole-value or embedded. */
function resolveStampedValue(
  value: unknown,
  record: Record<string, unknown>,
  fields: Record<string, string> | undefined,
): unknown {
  if (typeof value !== 'string' || !value.includes('*')) return value
  if (/^\*[A-Za-z_$][\w$]*(?:\.[\w$]+)*$/.test(value)) {
    return lookupRecord(record, value.slice(1), fields) ?? ''
  }
  return value.replace(/\*([A-Za-z_$][\w$]*(?:\.[\w$]+)*)/g, (_m, path: string) => {
    const hit = lookupRecord(record, path, fields)
    return hit === undefined || hit === null ? '' : String(hit)
  })
}

/** Clone a bind template subtree per record, resolving `*field` props. */
function stampSubtree(
  ir: ProjectIR,
  templateId: string,
  record: Record<string, unknown>,
  fields: Record<string, string> | undefined,
  idPrefix: string,
): string {
  const t = ir.objects.get(templateId)
  if (!t) return ''
  const newId = `${idPrefix}_${t.id}`
  if (!ir.objects.has(newId)) {
    const props: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(t.props)) {
      props[k] = resolveStampedValue(v, record, fields)
    }
    ir.objects.set(newId, {
      id: newId,
      kind: t.kind,
      props,
      children: [],
      parentId: null,
      contentTemplateId: null,
      bindings: [],
      breakpointProps: {},
      tracked: [],
      inlineWhens: [],
    })
    const clone = ir.objects.get(newId)!
    for (const c of t.children) {
      const childId = stampSubtree(ir, c, record, fields, idPrefix)
      if (childId) clone.children.push(childId)
    }
  }
  return newId
}

export function renderList(ir: ProjectIR, node: RenderNode): string {
  const props = node.props
  const attrList = baseAttrs(node)
  const skip = new Set(['id', 'name', 'placement', 'data', 'address', 'app'])
  attrList.push(...carryProps(props, skip))
  const data = Array.isArray(props['data']) ? (props['data'] as unknown[]) : null
  const templateId = (ir.objects.get(node.id)?.contentTemplateId ?? null) as string | null
  let inner: string
  if (data && templateId && ir.objects.has(templateId)) {
    const shape = (node.bindings[0]?.shape ?? {}) as { items?: string; key?: string; fields?: Record<string, string> }
    // Each array element is one record; `items` selects a nested record array
    // when elements are wrapper objects instead of records themselves.
    const parts: string[] = []
    let index = 0
    for (const value of data) {
      let records: unknown[]
      if (shape.items && value && typeof value === 'object') {
        const nested = lookupRecord(value as Record<string, unknown>, shape.items, undefined)
        records = Array.isArray(nested) ? nested : []
      } else {
        records = [value]
      }
      for (const record of records) {
        const rec = record && typeof record === 'object' ? (record as Record<string, unknown>) : { value: record }
        const key = shape.key && rec[shape.key] !== undefined ? String(rec[shape.key]) : String(index)
        const rootId = stampSubtree(ir, templateId, rec, shape.fields, `${node.id}__${key}`)
        if (rootId) parts.push(renderNode(ir, rootId))
        index += 1
      }
    }
    inner = parts.join('')
  } else {
    inner = node.children.map((c) => renderNode(ir, c)).join('')
  }
  return `<div ${attrList.join(' ')}>${inner}</div>`
}

const CHART_PALETTE = ['#6366F1', '#A855F7', '#EC4899', '#10B981', '#F59E0B', '#0284C7']

export function renderChart(ir: ProjectIR, node: RenderNode): string {
  const props = node.props
  const attrList = baseAttrs(node)
  attrList.push('role="img"')
  const skip = new Set(['id', 'name', 'placement', 'data', 'address', 'app', 'kind', 'series', 'labels', 'points', 'palette'])
  attrList.push(...carryProps(props, skip))
  const kind = typeof props['kind'] === 'string' ? props['kind'] : 'bar'
  const series: number[][] = Array.isArray(props['series']) ? (props['series'] as number[][]) : []
  const labels: string[] = Array.isArray(props['labels']) ? (props['labels'] as string[]) : []
  const palette: string[] = Array.isArray(props['palette']) && (props['palette'] as unknown[]).length > 0 ? (props['palette'] as string[]) : CHART_PALETTE
  const W = 400
  const H = 220
  const P = 28
  const num = (n: number): string => String(Math.round(n * 10) / 10)

  let svg = ''
  if (kind === 'pie' || kind === 'donut') {
    const values = series[0] ?? []
    const total = values.reduce((a, b) => a + (Number(b) || 0), 0)
    if (total <= 0 || values.length === 0) {
      svg = ''
    } else if (kind === 'donut') {
      const R = 70
      const C = 2 * Math.PI * R
      let offset = 25
      const circles = values.map((v, i) => {
        const frac = Number(v) / total
        const s = `<circle cx="200" cy="110" r="${R}" fill="none" stroke="${palette[i % palette.length]}" stroke-width="30" stroke-dasharray="${num(frac * C)} ${num(C)}" stroke-dashoffset="${num((-offset * C) / 100)}" transform="rotate(-90 200 110)" />`
        offset += frac * 100
        return s
      })
      svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="presentation">${circles.join('')}</svg>`
    } else {
      const cx = 200
      const cy = 110
      const R = 80
      let angle = -Math.PI / 2
      const paths = values.map((v, i) => {
        const frac = Number(v) / total
        const a0 = angle
        angle += frac * Math.PI * 2
        const a1 = angle
        const large = frac > 0.5 ? 1 : 0
        const x0 = cx + R * Math.cos(a0)
        const y0 = cy + R * Math.sin(a0)
        const x1 = cx + R * Math.cos(a1)
        const y1 = cy + R * Math.sin(a1)
        return `<path d="M ${num(cx)} ${num(cy)} L ${num(x0)} ${num(y0)} A ${R} ${R} 0 ${large} 1 ${num(x1)} ${num(y1)} Z" fill="${palette[i % palette.length]}" />`
      })
      svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="presentation">${paths.join('')}</svg>`
    }
  } else if (kind === 'line' || kind === 'area' || kind === 'scatter') {
    const all = series.length > 0 ? series : []
    const flat = all.flat().map(Number).filter(Number.isFinite)
    const max = Math.max(1, ...flat)
    const n = Math.max(...all.map((s) => s.length), 0)
    const px = (i: number): number => (n <= 1 ? W / 2 : P + (i * (W - 2 * P)) / (n - 1))
    const py = (v: number): number => H - P - (v / max) * (H - 2 * P)
    if (kind === 'scatter') {
      const pts: string[] = []
      all.forEach((s, si) => {
        s.forEach((v, i) => {
          pts.push(`<circle cx="${num(px(i))}" cy="${num(py(Number(v) || 0))}" r="4" fill="${palette[si % palette.length]}" />`)
        })
      })
      svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="presentation">${pts.join('')}</svg>`
    } else {
      const layers = all.map((s, si) => {
        const line = s.map((v, i) => `${num(px(i))},${num(py(Number(v) || 0))}`).join(' ')
        const color = palette[si % palette.length]
        if (kind === 'area' && si === 0) {
          return `<polygon points="${P},${H - P} ${line} ${W - P},${H - P}" fill="${color}" fill-opacity="0.25" /><polyline points="${line}" fill="none" stroke="${color}" stroke-width="2" />`
        }
        return `<polyline points="${line}" fill="none" stroke="${color}" stroke-width="2" />`
      })
      svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="presentation">${layers.join('')}</svg>`
    }
  } else {
    // bar (default)
    const values = series[0] ?? []
    const max = Math.max(1, ...values.map((v) => Number(v) || 0))
    const n = values.length
    const slot = n > 0 ? (W - 2 * P) / n : 0
    const bars = values.map((v, i) => {
      const num2 = Number(v) || 0
      const h = (num2 / max) * (H - 2 * P)
      const x = P + i * slot + slot * 0.2
      const y = H - P - h
      const label = labels[i] !== undefined ? `<text x="${num(x + slot * 0.3)}" y="${H - 8}" font-size="10" text-anchor="middle">${escHtml(String(labels[i]))}</text>` : ''
      return `<rect x="${num(x)}" y="${num(y)}" width="${num(slot * 0.6)}" height="${num(h)}" rx="3" fill="${palette[i % palette.length]}" />${label}`
    })
    svg = n > 0 ? `<svg viewBox="0 0 ${W} ${H}" width="100%" role="presentation">${bars.join('')}</svg>` : ''
  }

  if (!svg) return `<div ${attrList.join(' ')}><div data-part="empty">No data</div></div>`
  return `<div ${attrList.join(' ')}>${svg}</div>`
}

export function renderProgress(ir: ProjectIR, node: RenderNode): string {
  const props = node.props
  void ir
  const attrList = baseAttrs(node)
  attrList.push('role="progressbar"')
  const value = Number(props['value'] ?? 0)
  const max = Number(props['max'] ?? 100) || 100
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  attrList.push(`aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100"`)
  const skip = new Set(['id', 'name', 'placement', 'data', 'address', 'app', 'value', 'max', 'showLabel', 'striped', 'animated'])
  attrList.push(...carryProps(props, skip))
  const fillAttrs = [`style="width:${Math.round(pct * 10) / 10}%"`]
  if (props['striped'] === true) fillAttrs.push('data-striped="true"')
  if (props['animated'] === true) fillAttrs.push('data-animated="true"')
  const label = props['showLabel'] === true ? `<span data-part="label">${Math.round(pct)}%</span>` : ''
  return `<div ${attrList.join(' ')}><div data-part="fill" ${fillAttrs.join(' ')}></div>${label}</div>`
}
