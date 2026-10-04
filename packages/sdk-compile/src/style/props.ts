/**
 * Prop vocabulary to CSS declarations.
 */
import { ALIGN_MAP, ALERT_VARIANTS, BADGE_VARIANTS, BUTTON_VARIANTS, DIALOG_SIZES, DIMENSION_WORDS, JUSTIFY_MAP, LAYOUT_WORDS, PROGRESS_VARIANTS, RADIUS_SCALE, RADIUS_WORDS, SHADOW_SCALE, SPACING_SCALE, SPACING_WORDS, SURFACE_TOKENS, TABLE_DENSITY, TABLE_VARIANTS, TEXT_SCALE } from './tokens';
import type { ProjectIR } from '../ir';

export interface StyleCtx {
  measures: Map<string, number | string>
  surfaceOverrides: Map<string, Record<string, string>>
  effectOverrides: Map<string, string>
  radiusOverrides: Map<string, string>
  fontOverrides: Map<string, Record<string, string>>
}

/** Plain form of StyleCtx — the page runtime rebuilds its context from this. */
export interface StyleCtxJSON {
  measures: Record<string, number | string>
  surfaceOverrides: Record<string, Record<string, string>>
  effectOverrides: Record<string, string>
  radiusOverrides: Record<string, string>
  fontOverrides: Record<string, Record<string, string>>
}

export function serializeStyleCtx(ctx: StyleCtx): StyleCtxJSON {
  return {
    measures: Object.fromEntries(ctx.measures),
    surfaceOverrides: Object.fromEntries(ctx.surfaceOverrides),
    effectOverrides: Object.fromEntries(ctx.effectOverrides),
    radiusOverrides: Object.fromEntries(ctx.radiusOverrides),
    fontOverrides: Object.fromEntries(ctx.fontOverrides),
  }
}

export function hydrateStyleCtx(json: StyleCtxJSON): StyleCtx {
  return {
    measures: new Map(Object.entries(json.measures ?? {})),
    surfaceOverrides: new Map(Object.entries(json.surfaceOverrides ?? {})),
    effectOverrides: new Map(Object.entries(json.effectOverrides ?? {})),
    radiusOverrides: new Map(Object.entries(json.radiusOverrides ?? {})),
    fontOverrides: new Map(Object.entries(json.fontOverrides ?? {})),
  }
}

export function buildStyleCtx(ir: ProjectIR): StyleCtx {
  const ctx: StyleCtx = {
    measures: ir.measures,
    surfaceOverrides: new Map(),
    effectOverrides: new Map(),
    radiusOverrides: new Map(),
    fontOverrides: new Map(),
  }
  // Last write wins per domain+key (matches the recording registry semantics).
  for (const m of ir.transformerMutations) {
    const key = m.key.toLowerCase()
    if (m.op === 'remove') {
      if (m.domain === 'surfaces') ctx.surfaceOverrides.delete(key)
      if (m.domain === 'effects') ctx.effectOverrides.delete(key)
      if (m.domain === 'radius') ctx.radiusOverrides.delete(key)
      if (m.domain === 'fonts') ctx.fontOverrides.delete(key)
      continue
    }
    if (m.domain === 'surfaces' && m.value && typeof m.value === 'object') {
      ctx.surfaceOverrides.set(key, m.value as Record<string, string>)
    } else if (m.domain === 'surfaces' && typeof m.value === 'string') {
      ctx.surfaceOverrides.set(key, { background: m.value })
    } else if (m.domain === 'effects' && typeof m.value === 'string') {
      ctx.effectOverrides.set(key, m.value)
    } else if (m.domain === 'radius' && typeof m.value === 'string') {
      ctx.radiusOverrides.set(key, m.value)
    } else if (m.domain === 'fonts' && m.value && typeof m.value === 'object') {
      ctx.fontOverrides.set(key, m.value as Record<string, string>)
    } else if (m.domain === 'fonts' && typeof m.value === 'string') {
      ctx.fontOverrides.set(key, { 'font-size': m.value })
    }
  }
  return ctx
}

/** Resolve a Dim (units | named measure | sizing mode | MeasureExpr) to CSS. */
function dimToCss(dim: unknown, ctx: StyleCtx, unit = 4): string | null {
  if (dim === undefined || dim === null) return null
  if (typeof dim === 'number') return SPACING_SCALE[dim] ?? `${dim * unit}px`
  if (typeof dim === 'string') {
    const t = dim.trim()
    if (t === '') return null
    if (t === 'fill' || t === 'full' || t === 'fullwidth' || t === 'full-width' || t === 'fullparentwidth') return '100%'
    if (t === 'hug' || t === 'auto' || t === 'hugcontent' || t === 'hug-content') return 'fit-content'
    if (t === 'stretch') return '100%'
    if (t === 'half' || t === 'halfwidth') return '50%'
    if (t === 'third') return '33.333%'
    if (t === 'quarter') return '25%'
    if (t === 'threequarters') return '75%'
    if (t === 'fullheight') return '100%'
    if (!Number.isNaN(Number(t))) return `${t}px`
    if (/%|px|rem|em|vw|vh|fr|auto|fit-content|max-content|min-content/.test(t)) return t
    const named = ctx.measures.get(t)
    if (typeof named === 'number') return `${named * unit}px`
    if (typeof named === 'string') return named
    return `var(--m-${t})`
  }
  if (typeof dim === 'object') {
    const expr = dim as { of?: string; mul?: number; add?: unknown }
    if (typeof expr.of === 'string') {
      const base = dimToCss(expr.of, ctx, unit) ?? `var(--m-${expr.of})`
      const mul = typeof expr.mul === 'number' ? expr.mul : 1
      const add = expr.add !== undefined ? dimToCss(expr.add, ctx, unit) : null
      let out = mul !== 1 ? `calc(${base} * ${mul})` : base
      if (add) out = `calc(${out} + ${add})`
      return out
    }
  }
  return null
}

/** Expand a bare make() token left on props into concrete prop writes. */
function expandBareToken(props: Record<string, unknown>): void {
  const raw = props['token']
  if (typeof raw !== 'string') return
  const v = raw.trim().toLowerCase()
  delete props['token']
  if (RADIUS_WORDS[v]) {
    props['radius'] = RADIUS_WORDS[v]
    return
  }
  if (SHADOW_SCALE[v]) {
    props['effect'] = v
    return
  }
  if (SPACING_WORDS[v]) {
    for (const [p, n] of SPACING_WORDS[v]!) props[p] = n
    return
  }
  if (DIMENSION_WORDS[v]) {
    const d = DIMENSION_WORDS[v]!
    props[d.prop] = d.value
    return
  }
  if (TEXT_SCALE[v]) {
    props['font'] = v
    return
  }
  if (LAYOUT_WORDS[v]) {
    props['layout'] = LAYOUT_WORDS[v]
    return
  }
  if (v === 'bold') { props['fontWeight'] = '700'; return }
  if (v === 'semibold') { props['fontWeight'] = '600'; return }
  if (v === 'light') { props['fontWeight'] = '300'; return }
  if (v === 'italic') { props['fontStyle'] = 'italic'; return }
  if (v === 'underline' || v === 'underlined') { props['textDecoration'] = 'underline'; return }
  if (v === 'uppercased') { props['textTransform'] = 'uppercase'; return }
  if (v === 'lowercase') { props['textTransform'] = 'lowercase'; return }
  if (v === 'hidden' || v === 'invisible') { props['display'] = 'none'; return }
  // Unknown token: keep it as a hook class target, no CSS of its own.
  props['data-token'] = v
}
export function resolvePropsToCss(
  rawProps: Record<string, unknown>,
  kind: string,
  ctx: StyleCtx,
): Record<string, string> {
  const props: Record<string, unknown> = { ...rawProps }
  expandBareToken(props)
  const css: Record<string, string> = {}

  const layout = props['layout']
  if (kind === 'vstack' && layout === undefined) {
    css['display'] = 'flex'
    css['flex-direction'] = 'column'
  } else if (kind === 'hstack' && layout === undefined) {
    css['display'] = 'flex'
    css['flex-direction'] = 'row'
  } else if (typeof layout === 'string') {
    if (layout === 'row' || layout === 'horizontal' || layout === 'h') {
      css['display'] = 'flex'
      css['flex-direction'] = 'row'
    } else if (layout === 'col' || layout === 'column' || layout === 'vertical' || layout === 'v' || layout === 'stacked') {
      css['display'] = 'flex'
      css['flex-direction'] = 'column'
    } else if (layout === 'grid') {
      css['display'] = 'grid'
    } else if (layout === 'none') {
      css['display'] = 'none'
    }
  }
  const grid = props['grid']
  if (grid && typeof grid === 'object') {
    const spec = grid as { cols?: number | 'auto'; rows?: number; colW?: unknown; rowH?: unknown; flow?: string }
    css['display'] = 'grid'
    if (typeof spec.cols === 'number') css['grid-template-columns'] = `repeat(${spec.cols}, minmax(0, 1fr))`
    else if (spec.cols === 'auto') css['grid-template-columns'] = 'repeat(auto-fill, minmax(0, 1fr))'
    if (typeof spec.rows === 'number') css['grid-template-rows'] = `repeat(${spec.rows}, auto)`
    if (spec.colW !== undefined) {
      const w = dimToCss(spec.colW, ctx)
      if (w) css['grid-auto-columns'] = w
    }
    if (spec.rowH !== undefined) {
      const h = dimToCss(spec.rowH, ctx)
      if (h) css['grid-auto-rows'] = h
    }
  }

  if (typeof props['align'] === 'string') css['align-items'] = ALIGN_MAP[props['align'] as string] ?? (props['align'] as string)
  if (typeof props['justify'] === 'string') {
    css['justify-content'] = JUSTIFY_MAP[props['justify'] as string] ?? (props['justify'] as string)
  }

  // `spacing` is the stack-friendly alias of `gap`; stacks get a default.
  const gapVal = props['gap'] ?? props['spacing']
  if (gapVal !== undefined) {
    const g = dimToCss(gapVal, ctx)
    if (g) css['gap'] = g
  } else if (kind === 'vstack' || kind === 'hstack') {
    css['gap'] = dimToCss(3, ctx) ?? '12px'
  }
  if (props['pad'] !== undefined) {
    const p = dimToCss(props['pad'], ctx)
    if (p) css['padding'] = p
  }
  const w = props['width'] ?? props['w']
  if (w !== undefined) {
    const v = dimToCss(w, ctx)
    if (v) {
      css['width'] = v
      if (w === 'fill' || w === 'full') css['flex-grow'] = '1'
    }
  }
  const h = props['height'] ?? props['h']
  if (h !== undefined) {
    const v = dimToCss(h, ctx)
    if (v) {
      css['height'] = v
      if (h === 'fill' || h === 'full') css['flex-grow'] = '1'
    }
  }
  for (const [prop, cssProp] of [['minW', 'min-width'], ['maxW', 'max-width'], ['minH', 'min-height'], ['maxH', 'max-height']] as const) {
    if (props[prop] !== undefined) {
      const v = dimToCss(props[prop], ctx)
      if (v) css[cssProp] = v
    }
  }
  if (props['wrap'] === true) css['flex-wrap'] = 'wrap'
  else if (typeof props['wrap'] === 'string') css['flex-wrap'] = props['wrap'] as string
  if (typeof props['overflow'] === 'string') css['overflow'] = props['overflow'] as string
  if (props['grow'] !== undefined) css['flex-grow'] = String(props['grow'])

  const surface = props['surface']
  if (typeof surface === 'string') {
    const token = ctx.surfaceOverrides.get(surface.toLowerCase()) ?? SURFACE_TOKENS[surface]
    if (token) Object.assign(css, token)
  }
  if (props['radius'] !== undefined) {
    const r = props['radius']
    if (typeof r === 'number') css['border-radius'] = `${r}px`
    else if (typeof r === 'string') {
      css['border-radius'] =
        ctx.radiusOverrides.get(r.toLowerCase()) ?? RADIUS_SCALE[r] ?? RADIUS_SCALE[r.toLowerCase()] ?? r
    }
  }
  if (props['border'] === true) css['border'] = '1px solid var(--border)'
  else if (typeof props['border'] === 'string') css['border'] = props['border'] as string
  // Per-side borders: true → width+color, number → unit px, string → raw CSS.
  {
    const bw = props['borderWidth'] !== undefined ? dimToCss(props['borderWidth'], ctx) : null
    const bc = typeof props['borderColor'] === 'string' ? (props['borderColor'] as string) : 'var(--border)'
    const width = bw ?? '1px'
    const sides: Array<[unknown, string]> = [
      [props['borderTop'], 'border-top'],
      [props['borderBottom'], 'border-bottom'],
      [props['borderLeft'], 'border-left'],
      [props['borderRight'], 'border-right'],
    ]
    for (const [side, cssProp] of sides) {
      if (side === true) css[cssProp] = `${width} solid ${bc}`
      else if (typeof side === 'number') css[cssProp] = `${side}px solid ${bc}`
      else if (typeof side === 'string' && side !== '') css[cssProp] = side
    }
  }
  const effect = props['effect'] ?? props['boxShadow'] ?? props['shadow']
  if (typeof effect === 'string' && effect !== '') {
    const resolved = ctx.effectOverrides.get(effect.toLowerCase()) ?? SHADOW_SCALE[effect] ?? SHADOW_SCALE[effect.toLowerCase()] ?? effect
    if (resolved && resolved !== 'none') css['box-shadow'] = resolved
  } else if (typeof props['boxShadow'] === 'string' && props['boxShadow'] !== '') {
    css['box-shadow'] = props['boxShadow'] as string
  }
  if (typeof props['bg'] === 'string' && props['bg'] !== '') css['background'] = props['bg'] as string
  if (typeof props['color'] === 'string' && props['color'] !== '') css['color'] = props['color'] as string

  const font = props['font']
  if (typeof font === 'string') {
    const preset = ctx.fontOverrides.get(font.toLowerCase()) ?? TEXT_SCALE[font] ?? TEXT_SCALE[font.toLowerCase()]
    if (preset) Object.assign(css, preset)
  }
  if (props['fontSize'] !== undefined) {
    const v = dimToCss(props['fontSize'], ctx)
    if (v) css['font-size'] = v
  }
  if (props['fontWeight'] !== undefined) css['font-weight'] = String(props['fontWeight'])
  if (typeof props['fontStyle'] === 'string') css['font-style'] = props['fontStyle'] as string
  if (typeof props['fontFamily'] === 'string') css['font-family'] = props['fontFamily'] as string
  if (typeof props['textDecoration'] === 'string') css['text-decoration'] = props['textDecoration'] as string
  if (typeof props['textTransform'] === 'string') css['text-transform'] = props['textTransform'] as string
  // make('hidden') / make('visible') — the visibility words in the token
  // vocabulary resolve to this prop.
  if (typeof props['visibility'] === 'string') css['visibility'] = props['visibility'] as string
  if (props['opacity'] !== undefined) css['opacity'] = String(props['opacity'])
  if (typeof props['align'] === 'string' && (kind === 'text' || kind === 'markdown' || kind === 'label')) {
    const a = props['align'] as string
    if (['start', 'center', 'end', 'left', 'right', 'justify'].includes(a)) css['text-align'] = a
  }
  if (typeof props['lineHeight'] === 'string' || typeof props['lineHeight'] === 'number') {
    css['line-height'] = String(props['lineHeight'])
  }

  if (props['layer'] !== undefined && props['layer'] !== '' && props['layer'] !== false) {
    css['z-index'] = String(props['layer'])
    css['position'] = 'relative'
  }
  const placement = props['placement']
  if (placement && typeof placement === 'object') {
    const p = placement as { mode?: string; at?: [unknown, unknown]; order?: number; grow?: number; layer?: number; size?: { w?: unknown; h?: unknown } }
    if (p.mode === 'free') {
      css['position'] = 'absolute'
      if (Array.isArray(p.at)) {
        const x = dimToCss(p.at[0], ctx)
        const y = dimToCss(p.at[1], ctx)
        if (x) css['left'] = x
        if (y) css['top'] = y
      }
    } else if (p.mode === 'pin') {
      css['position'] = 'fixed'
    }
    if (typeof p.order === 'number') css['order'] = String(p.order)
    if (typeof p.grow === 'number') css['flex-grow'] = String(p.grow)
    if (typeof p.layer === 'number') {
      css['z-index'] = String(p.layer)
      css['position'] = css['position'] ?? 'relative'
    }
    if (p.size?.w !== undefined) {
      const v = dimToCss(p.size.w, ctx)
      if (v) css['width'] = v
    }
    if (p.size?.h !== undefined) {
      const v = dimToCss(p.size.h, ctx)
      if (v) css['height'] = v
    }
  }

  if (kind === 'button') {
    css['cursor'] = 'pointer'
    css['border-radius'] = css['border-radius'] ?? RADIUS_SCALE['md']!
    css['padding'] = css['padding'] ?? '8px 16px'
    css['font-weight'] = css['font-weight'] ?? '600'
    const variant = typeof props['variant'] === 'string' ? props['variant'] : 'primary'
    if (!css['background']) Object.assign(css, BUTTON_VARIANTS[variant] ?? BUTTON_VARIANTS['primary']!)
  }
  if (kind === 'input' || kind === 'textarea' || kind === 'select') {
    css['border'] = css['border'] ?? '1px solid var(--border)'
    css['border-radius'] = css['border-radius'] ?? RADIUS_SCALE['md']!
    css['padding'] = css['padding'] ?? '8px 12px'
  }
  if (kind === 'badge') {
    css['display'] = css['display'] ?? 'inline-flex'
    css['align-items'] = css['align-items'] ?? 'center'
    css['gap'] = css['gap'] ?? '4px'
    css['border-radius'] = css['border-radius'] ?? RADIUS_SCALE['full']!
    css['padding'] = css['padding'] ?? '2px 8px'
    css['font-size'] = css['font-size'] ?? '12px'
    css['font-weight'] = css['font-weight'] ?? '600'
    const variant = typeof props['variant'] === 'string' ? props['variant'] : 'default'
    if (!css['background']) Object.assign(css, BADGE_VARIANTS[variant] ?? BADGE_VARIANTS['default']!)
  }
  if (kind === 'alert') {
    css['border-radius'] = css['border-radius'] ?? RADIUS_SCALE['md']!
    css['padding'] = css['padding'] ?? '12px 16px'
    const variant = typeof props['variant'] === 'string' ? props['variant'] : 'info'
    if (!css['background']) Object.assign(css, ALERT_VARIANTS[variant] ?? ALERT_VARIANTS['info']!)
  }
  if (kind === 'table') {
    css['border-collapse'] = 'collapse'
    css['width'] = css['width'] ?? '100%'
    const variant = typeof props['variant'] === 'string' ? props['variant'] : 'default'
    Object.assign(css, TABLE_VARIANTS[variant] ?? {})
  }
  if (kind === 'dialog') {
    const size = typeof props['size'] === 'string' ? props['size'] : 'md'
    css['max-width'] = DIALOG_SIZES[size] ?? DIALOG_SIZES['md']!
    css['width'] = css['width'] ?? '90%'
    css['border'] = css['border'] ?? '1px solid var(--border)'
    css['border-radius'] = css['border-radius'] ?? RADIUS_SCALE['lg']!
    css['padding'] = css['padding'] ?? '24px'
    if (!css['background']) {
      const variant = props['variant']
      css['background'] = variant === 'danger' ? '#FEF2F2' : 'var(--card)'
      css['color'] = variant === 'danger' ? '#991B1B' : 'var(--card-foreground)'
    }
  }
  if (kind === 'progress') {
    css['width'] = css['width'] ?? '100%'
    css['height'] = css['height'] ?? '8px'
    css['border-radius'] = css['border-radius'] ?? RADIUS_SCALE['full']!
    css['background'] = css['background'] ?? 'var(--muted)'
    css['overflow'] = 'hidden'
  }
  if (kind === 'image' || kind === 'video') {
    css['max-width'] = css['max-width'] ?? '100%'
    if (typeof props['fit'] === 'string' && props['fit'] !== '') css['object-fit'] = props['fit'] as string
    if (typeof props['aspectRatio'] === 'string' && props['aspectRatio'] !== '') {
      css['aspect-ratio'] = props['aspectRatio'] as string
    } else if (typeof props['aspectRatio'] === 'number') {
      css['aspect-ratio'] = String(props['aspectRatio'])
    }
  }
  if (typeof props['display'] === 'string') css['display'] = props['display'] as string
  if (typeof props['cursor'] === 'string') css['cursor'] = props['cursor'] as string
  if (typeof props['opacity'] === 'number' || typeof props['opacity'] === 'string') {
    css['opacity'] = String(props['opacity'])
  }

  const rawStyle = props['style']
  if (typeof rawStyle === 'string' && rawStyle.trim() !== '') {
    for (const decl of rawStyle.split(';')) {
      const idx = decl.indexOf(':')
      if (idx <= 0) continue
      const prop = decl.slice(0, idx).trim().replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
      const val = decl.slice(idx + 1).trim()
      if (prop && val) css[prop] = val
    }
  }
  // Unknown bare tokens carry no CSS of their own (kept as data-prop-token in HTML).
  return css
}

export function cssDeclsToString(css: Record<string, string>): string {
  return Object.entries(css)
    .map(([k, v]) => `${k}:${v}`)
    .join(';')
}
