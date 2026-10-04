/**
 * Icon resolution + label slots.
 */
import { escAttr, escHtml } from './html';
import type { ProjectIR } from '../ir';

export function resolveIconToHtml(iconKey: string, ir: ProjectIR): string {
  const def = ir.icons.get(iconKey)
  const escKey = escAttr(iconKey)
  if (!def) {
    // Undeclared keys render as raw glyphs so plain strings keep working.
    return `<span data-part="icon" data-icon="${escKey}">${escHtml(iconKey)}</span>`
  }
  switch (def.kind) {
    case 'glyph':
      return `<span data-part="icon" data-icon="${escKey}">${escHtml(String(def['glyph'] ?? ''))}</span>`
    case 'svg':
      return `<span data-part="icon" data-icon="${escKey}">${String(def['svg'] ?? '')}</span>`
    case 'asset':
      return `<img data-part="icon" data-icon="${escKey}" src="/assets/${escAttr(String(def['asset'] ?? ''))}" alt="" />`
    case 'url':
      return `<img data-part="icon" data-icon="${escKey}" src="${escAttr(String(def['url'] ?? ''))}" alt="" />`
    case 'file':
      return `<img data-part="icon" data-icon="${escKey}" src="${escAttr(String(def['path'] ?? ''))}" alt="" />`
    case 'library':
      return `<i data-part="icon" data-icon="${escKey}" data-lucide="${escAttr(String(def['name'] ?? iconKey))}"></i>`
    default:
      return `<span data-part="icon" data-icon="${escKey}">${escHtml(iconKey)}</span>`
  }
}

export function iconFor(ir: ProjectIR, props: Record<string, unknown>): { html: string | null; position: 'left' | 'right' } {
  const icon = props['icon']
  if (typeof icon !== 'string' || icon === '') return { html: null, position: 'left' }
  const position = props['iconPosition'] === 'right' ? 'right' : 'left'
  return { html: resolveIconToHtml(icon, ir), position }
}

export function withIcon(textHtml: string, icon: { html: string | null; position: 'left' | 'right' }): string {
  if (!icon.html) return textHtml
  return icon.position === 'right' ? `${textHtml}${icon.html}` : `${icon.html}${textHtml}`
}
