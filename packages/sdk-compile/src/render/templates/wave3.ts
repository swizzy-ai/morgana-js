/**
 * Templates: datePicker, radioGroup, pagination, collapsible, carousel,
 * colorPicker, contextMenu, commandPalette.
 *
 * Same contract as every other component: one element carries
 * `data-entity`/`data-kind`, internals are `data-part`s, state lives in
 * `data-*` attributes the client behaviours and handle methods both read, so a
 * user interaction and a method call paint the same way.
 */
import { baseAttrs, carryProps, escAttr, escHtml, type RenderNode } from '../html'
import { renderNode } from '../node'
import type { ProjectIR } from '../../ir'
import { qrMarkup } from '../../qr'

const STRUCT = ['id', 'name', 'placement', 'data', 'address', 'app']
const skipOf = (...more: string[]) => new Set([...STRUCT, ...more])
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : v === undefined || v === null ? d : String(v))
const arr = <T = Record<string, unknown>>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

// ── datePicker ──────────────────────────────────────────────────────────────

/** `YYYY-MM-DD`, or '' for anything that is not a real calendar date. */
export function normalizeDate(v: unknown): string {
  const s = str(v).trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return ''
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) ? s : ''
}

export function renderDatePicker(ir: ProjectIR, node: RenderNode): string {
  void ir
  const p = node.props
  const attrs = baseAttrs(node)
  const value = normalizeDate(p['value'])
  const min = normalizeDate(p['min'])
  const max = normalizeDate(p['max'])
  const disabled = p['disabled'] === true
  attrs.push(`data-value="${escAttr(value)}"`, 'data-open="false"')
  if (min) attrs.push(`data-min="${min}"`)
  if (max) attrs.push(`data-max="${max}"`)
  if (disabled) attrs.push('data-disabled="true"')
  if (p['weekStart'] === 'monday') attrs.push('data-week-start="1"')
  attrs.push(...carryProps(p, skipOf('value', 'min', 'max', 'disabled', 'placeholder', 'weekStart')))
  const name = typeof p['name'] === 'string' ? ` name="${escAttr(p['name'])}"` : ''
  let html = `<div ${attrs.join(' ')}>`
  html += `<div data-part="control"><input type="text" data-part="field" readonly${name} value="${escAttr(value)}" placeholder="${escAttr(str(p['placeholder'], 'Pick a date'))}"${disabled ? ' disabled' : ''} aria-haspopup="dialog" />`
  html += `<button type="button" data-part="trigger" aria-label="Open calendar"${disabled ? ' disabled' : ''}>📅</button></div>`
  // The month grid is built by the client when it opens: "this month" is the
  // visitor's, not the build machine's.
  html += '<div data-part="calendar" role="dialog" aria-label="Choose a date" hidden></div>'
  html += '</div>'
  return html
}

/**
 * dateRange — the date picker's calendar picking two dates. The first click
 * sets the start, the second the end (swapped if earlier); days between are
 * marked in range.
 */
export function renderDateRange(ir: ProjectIR, node: RenderNode): string {
  void ir
  const p = node.props
  const attrs = baseAttrs(node)
  let start = normalizeDate(p['start'])
  let end = normalizeDate(p['end'])
  if (start && end && end < start) [start, end] = [end, start]
  if (!start) end = ''
  const min = normalizeDate(p['min'])
  const max = normalizeDate(p['max'])
  const disabled = p['disabled'] === true
  attrs.push('data-range="true"', `data-start="${start}"`, `data-end="${end}"`, 'data-open="false"')
  if (min) attrs.push(`data-min="${min}"`)
  if (max) attrs.push(`data-max="${max}"`)
  if (disabled) attrs.push('data-disabled="true"')
  if (p['weekStart'] === 'monday') attrs.push('data-week-start="1"')
  attrs.push(...carryProps(p, skipOf('start', 'end', 'min', 'max', 'disabled', 'placeholder', 'weekStart')))
  const shown = start ? `${start} → ${end || '…'}` : ''
  let html = `<div ${attrs.join(' ')}>`
  html += `<div data-part="control"><input type="text" data-part="field" readonly value="${escAttr(shown)}" placeholder="${escAttr(str(p['placeholder'], 'Pick dates'))}"${disabled ? ' disabled' : ''} aria-haspopup="dialog" />`
  html += `<button type="button" data-part="trigger" aria-label="Open calendar"${disabled ? ' disabled' : ''}>📅</button></div>`
  html += '<div data-part="calendar" role="dialog" aria-label="Choose dates" hidden></div>'
  html += '</div>'
  return html
}

// ── qrCode ──────────────────────────────────────────────────────────────────

export function renderQrCode(ir: ProjectIR, node: RenderNode): string {
  void ir
  const p = node.props
  const attrs = baseAttrs(node)
  attrs.push('role="img"', `aria-label="${escAttr(str(p['label'], 'QR code'))}"`)
  attrs.push(...carryProps(p, skipOf('value', 'ecc', 'codeColor', 'codeBackground', 'label')))
  return `<div ${attrs.join(' ')}>${qrMarkup(p)}</div>`
}

// ── radioGroup ──────────────────────────────────────────────────────────────

export function renderRadioGroup(ir: ProjectIR, node: RenderNode): string {
  void ir
  const p = node.props
  const attrs = baseAttrs(node)
  const value = str(p['value'])
  const groupName = escAttr(str(p['name'], `rg-${node.id}`))
  const disabled = p['disabled'] === true
  attrs.push('role="radiogroup"', `data-value="${escAttr(value)}"`, `data-orientation="${p['orientation'] === 'horizontal' ? 'horizontal' : 'vertical'}"`)
  if (disabled) attrs.push('data-disabled="true"')
  attrs.push(...carryProps(p, skipOf('options', 'value', 'disabled', 'orientation')))
  let html = `<div ${attrs.join(' ')}>`
  for (const o of arr(p['options'])) {
    const v = str(o['value'] ?? o['label'])
    const off = disabled || o['disabled'] === true
    html += `<label data-part="option" data-value="${escAttr(v)}"${off ? ' data-disabled="true"' : ''}>`
    html += `<input type="radio" data-part="radio" name="${groupName}" value="${escAttr(v)}"${v === value ? ' checked' : ''}${off ? ' disabled' : ''} />`
    html += `<span data-part="option-text"><span data-part="option-label">${escHtml(str(o['label'] ?? v))}</span>`
    if (o['description']) html += `<span data-part="option-description">${escHtml(str(o['description']))}</span>`
    html += '</span></label>'
  }
  html += '</div>'
  return html
}

// ── pagination ──────────────────────────────────────────────────────────────

/** Page numbers to show, with 'gap' for elided runs: 1 … 4 5 [6] 7 8 … 20 */
export function pageItems(page: number, pages: number, siblings = 1): Array<number | 'gap'> {
  if (pages <= 1) return [1]
  const out: Array<number | 'gap'> = []
  const lo = Math.max(2, page - siblings)
  const hi = Math.min(pages - 1, page + siblings)
  out.push(1)
  if (lo > 2) out.push('gap')
  for (let i = lo; i <= hi; i++) out.push(i)
  if (hi < pages - 1) out.push('gap')
  out.push(pages)
  return out
}

export function pageCount(total: unknown, pageSize: unknown): number {
  const t = Math.max(0, Math.floor(Number(total) || 0))
  const s = Math.max(1, Math.floor(Number(pageSize) || 10))
  return Math.max(1, Math.ceil(t / s))
}

export function renderPagination(ir: ProjectIR, node: RenderNode): string {
  void ir
  const p = node.props
  const attrs = baseAttrs(node)
  const pages = p['pages'] !== undefined ? Math.max(1, Math.floor(Number(p['pages']) || 1)) : pageCount(p['total'], p['pageSize'])
  const page = Math.min(pages, Math.max(1, Math.floor(Number(p['page']) || 1)))
  const siblings = Math.max(0, Math.min(3, Math.floor(Number(p['siblings'] ?? 1))))
  attrs.push('role="navigation"', 'aria-label="Pagination"', `data-page="${page}"`, `data-pages="${pages}"`, `data-siblings="${siblings}"`)
  attrs.push(...carryProps(p, skipOf('page', 'pages', 'total', 'pageSize', 'siblings')))
  let html = `<nav ${attrs.join(' ')}>`
  html += `<button type="button" data-part="prev" aria-label="Previous page"${page <= 1 ? ' disabled' : ''}>‹</button>`
  html += '<span data-part="pages">'
  for (const it of pageItems(page, pages, siblings)) {
    html += it === 'gap'
      ? '<span data-part="gap">…</span>'
      : `<button type="button" data-part="page" data-page="${it}"${it === page ? ' data-current="true" aria-current="page"' : ''}>${it}</button>`
  }
  html += '</span>'
  html += `<button type="button" data-part="next" aria-label="Next page"${page >= pages ? ' disabled' : ''}>›</button>`
  html += '</nav>'
  return html
}

// ── collapsible ─────────────────────────────────────────────────────────────

export function renderCollapsible(ir: ProjectIR, node: RenderNode): string {
  const p = node.props
  const attrs = baseAttrs(node)
  const open = p['open'] === true
  const disabled = p['disabled'] === true
  attrs.push(`data-open="${open ? 'true' : 'false'}"`)
  if (disabled) attrs.push('data-disabled="true"')
  attrs.push(...carryProps(p, skipOf('open', 'title', 'content', 'disabled')))
  const panelId = `${escAttr(node.id)}-panel`
  let html = `<div ${attrs.join(' ')}>`
  html += `<button type="button" data-part="trigger" aria-expanded="${open}" aria-controls="${panelId}"${disabled ? ' disabled' : ''}>`
  html += `<span data-part="title">${escHtml(str(p['title'], 'Details'))}</span><span data-part="chevron" aria-hidden="true">▾</span></button>`
  html += `<div data-part="panel" id="${panelId}"${open ? '' : ' hidden'}>`
  if (p['content'] !== undefined && p['content'] !== '') html += `<div data-part="content">${escHtml(str(p['content']))}</div>`
  html += node.children.map((c) => renderNode(ir, c)).join('')
  html += '</div></div>'
  return html
}

// ── carousel ────────────────────────────────────────────────────────────────

export function renderCarousel(ir: ProjectIR, node: RenderNode): string {
  const p = node.props
  const attrs = baseAttrs(node)
  // Slides: placed children, else `items` ({src, alt, title, caption}).
  const slides: string[] = node.children.length
    ? node.children.map((c) => renderNode(ir, c))
    : arr(p['items']).map((it) => {
        let s = ''
        if (it['src']) s += `<img data-part="slide-image" src="${escAttr(str(it['src']))}" alt="${escAttr(str(it['alt'] ?? it['title']))}" loading="lazy" />`
        if (it['title'] || it['caption']) {
          s += '<div data-part="caption">'
          if (it['title']) s += `<div data-part="caption-title">${escHtml(str(it['title']))}</div>`
          if (it['caption']) s += `<div data-part="caption-text">${escHtml(str(it['caption']))}</div>`
          s += '</div>'
        }
        return s
      })
  const count = slides.length
  const index = count ? Math.min(count - 1, Math.max(0, Math.floor(Number(p['index']) || 0))) : 0
  const autoplay = Math.max(0, Math.floor(Number(p['autoplay']) || 0))
  attrs.push('role="region"', 'aria-roledescription="carousel"', `data-index="${index}"`, `data-count="${count}"`, `data-loop="${p['loop'] === false ? 'false' : 'true'}"`)
  if (autoplay) attrs.push(`data-autoplay="${autoplay}"`)
  attrs.push(...carryProps(p, skipOf('items', 'index', 'autoplay', 'loop')))
  let html = `<div ${attrs.join(' ')}>`
  html += `<div data-part="viewport"><div data-part="track" style="transform:translateX(-${index * 100}%)">`
  slides.forEach((s, i) => {
    html += `<div data-part="slide" data-slide="${i}" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${count}"${i === index ? ' data-active="true"' : ' aria-hidden="true"'}>${s}</div>`
  })
  html += '</div></div>'
  if (count > 1) {
    html += '<button type="button" data-part="prev" aria-label="Previous slide">‹</button>'
    html += '<button type="button" data-part="next" aria-label="Next slide">›</button>'
    html += '<div data-part="dots">'
    for (let i = 0; i < count; i++) {
      html += `<button type="button" data-part="dot" data-slide="${i}" aria-label="Slide ${i + 1}"${i === index ? ' data-active="true"' : ''}></button>`
    }
    html += '</div>'
  }
  html += '</div>'
  return html
}

// ── colorPicker ─────────────────────────────────────────────────────────────

/** `#rrggbb` (lowercase), or '' for anything else. */
export function normalizeHex(v: unknown): string {
  const s = str(v).trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(s)) return s
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s)
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : ''
}

export function renderColorPicker(ir: ProjectIR, node: RenderNode): string {
  void ir
  const p = node.props
  const attrs = baseAttrs(node)
  const value = normalizeHex(p['value']) || '#000000'
  const disabled = p['disabled'] === true
  attrs.push(`data-value="${value}"`)
  if (disabled) attrs.push('data-disabled="true"')
  attrs.push(...carryProps(p, skipOf('value', 'swatches', 'disabled')))
  const name = typeof p['name'] === 'string' ? ` name="${escAttr(p['name'])}"` : ''
  let html = `<div ${attrs.join(' ')}>`
  html += `<input type="color" data-part="native" value="${value}"${name}${disabled ? ' disabled' : ''} aria-label="Colour" />`
  html += `<input type="text" data-part="hex" value="${value}" maxlength="7" spellcheck="false"${disabled ? ' disabled' : ''} aria-label="Hex colour" />`
  const swatches = arr<string>(p['swatches']).map(normalizeHex).filter(Boolean)
  if (swatches.length) {
    html += '<div data-part="swatches">'
    for (const sw of swatches) {
      html += `<button type="button" data-part="swatch" data-value="${sw}" style="background:${sw}" aria-label="${sw}"${sw === value ? ' data-active="true"' : ''}${disabled ? ' disabled' : ''}></button>`
    }
    html += '</div>'
  }
  html += '</div>'
  return html
}

// ── menus (contextMenu + commandPalette share item markup) ─────────────────

function menuItems(items: Array<Record<string, unknown>>, itemPart = 'item'): string {
  let html = ''
  let group: string | null = null
  for (const it of items) {
    if (it['separator'] === true) {
      html += '<div data-part="separator" role="separator"></div>'
      continue
    }
    const g = it['group'] === undefined ? null : str(it['group'])
    if (g !== null && g !== group) {
      html += `<div data-part="group-label">${escHtml(g)}</div>`
      group = g
    }
    const v = str(it['value'] ?? it['label'])
    const off = it['disabled'] === true
    html += `<button type="button" data-part="${itemPart}" role="menuitem" data-value="${escAttr(v)}" data-label="${escAttr(str(it['label'] ?? v))}"${off ? ' disabled' : ''}>`
    html += `<span data-part="item-label">${escHtml(str(it['label'] ?? v))}</span>`
    if (it['shortcut']) html += `<kbd data-part="shortcut">${escHtml(str(it['shortcut']))}</kbd>`
    html += '</button>'
  }
  return html
}

export function renderContextMenu(ir: ProjectIR, node: RenderNode): string {
  const p = node.props
  const attrs = baseAttrs(node)
  attrs.push('data-open="false"')
  attrs.push(...carryProps(p, skipOf('items', 'open')))
  // The children are the area that answers right-click; the menu floats.
  let html = `<div ${attrs.join(' ')}>`
  html += `<div data-part="area">${node.children.map((c) => renderNode(ir, c)).join('')}`
  if (node.children.length === 0 && p['content']) html += escHtml(str(p['content']))
  html += '</div>'
  html += `<div data-part="menu" role="menu" hidden>${menuItems(arr(p['items']))}</div>`
  html += '</div>'
  return html
}

export function renderCommandPalette(ir: ProjectIR, node: RenderNode): string {
  void ir
  const p = node.props
  const attrs = baseAttrs(node)
  const open = p['open'] === true
  attrs.push(`data-open="${open ? 'true' : 'false'}"`, `data-hotkey="${escAttr(str(p['hotkey'], 'mod+k'))}"`, 'role="dialog"', 'aria-modal="true"', 'aria-label="Command palette"')
  if (!open) attrs.push('hidden')
  attrs.push(...carryProps(p, skipOf('items', 'open', 'placeholder', 'hotkey', 'emptyText')))
  let html = `<div ${attrs.join(' ')}>`
  html += '<div data-part="overlay" data-close="true"></div>'
  html += '<div data-part="panel">'
  html += `<input type="text" data-part="search" placeholder="${escAttr(str(p['placeholder'], 'Type a command…'))}" autocomplete="off" spellcheck="false" aria-label="Search commands" />`
  html += `<div data-part="list" role="listbox">${menuItems(arr(p['items']), 'command')}</div>`
  html += `<div data-part="empty" hidden>${escHtml(str(p['emptyText'], 'No results'))}</div>`
  html += '</div></div>'
  return html
}
