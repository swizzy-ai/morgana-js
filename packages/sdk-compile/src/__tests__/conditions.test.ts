/**
 * Conditions, declared state and live lists — what the compiler writes so the
 * browser only flips attributes.
 */
import { describe, expect, it } from 'vitest'
import { createEmptyIR, type ProjectIR } from '../ir'
import { renderPageHtml } from '../render/page'
import { renderStyleCss } from '../style/sheet'
import { buildManifest } from '../render/manifest'
import { parseCondition } from '../style/conditions'

interface Spec {
  id: string
  kind: string
  props?: Record<string, unknown>
  kids?: string[]
  template?: string
  bind?: { prop: string; source: string; shape?: { key?: string } }
}

function build(specs: Spec[], roots?: string[]): ProjectIR {
  const ir = createEmptyIR()
  for (const s of specs) {
    ir.objects.set(s.id, {
      id: s.id,
      kind: s.kind,
      props: { id: s.id, ...(s.props ?? {}) },
      children: s.kids ?? [],
      parentId: null,
      contentTemplateId: s.template ?? null,
      bindings: s.bind ? [s.bind] : [],
      breakpointProps: {},
      tracked: [],
      inlineWhens: [],
    })
  }
  ir.objects.set('p', { id: 'p', kind: 'page', props: { id: 'p' }, children: [], parentId: null, contentTemplateId: null, bindings: [], breakpointProps: {}, tracked: [], inlineWhens: [] })
  ir.pages.set('p', { name: 'p', address: '/', rootIds: roots ?? specs.map((s) => s.id), app: null, render: 'static' })
  ir.breakpoints.set('split', { minWidth: 860 })
  return ir
}

describe('conditions', () => {
  it('parses every part', () => {
    expect(parseCondition('view=brief|work & @split & #composer:dragover & :fromEnd(2)')).toEqual([
      { type: 'state', key: 'view', values: ['brief', 'work'] },
      { type: 'screen', name: 'split' },
      { type: 'object', id: 'composer', state: 'dragover' },
      { type: 'position', nth: 2 },
    ])
    expect(() => parseCondition('#x:wobble')).toThrow(/not an object state/)
  })

  it('compiles state, screen and object conditions to selectors', () => {
    const ir = build([
      { id: 'v', kind: 'box', props: { layout: 'column', hidden: true, conditions: { 'view=work|done': { hidden: false } } } },
      { id: 'f', kind: 'box', props: { conditions: { 'panel=open & @split': { pad: 4 } } } },
      { id: 'o', kind: 'box', props: { hidden: true, conditions: { '#c:dragover': { hidden: false } } } },
    ])
    const css = renderStyleCss(ir)
    expect(css).toContain('[data-entity="v"]{display:none}')
    expect(css).toContain(':root[data-s-view="work"] [data-entity="v"],:root[data-s-view="done"] [data-entity="v"]{display:flex}')
    expect(css).toMatch(/@media \(min-width:860px\)\{:root\[data-s-panel="open"\] \[data-entity="f"\]\{padding:/)
    expect(css).toContain(':root:has([data-entity="c"][data-dragover]) [data-entity="o"]{display:revert-layer}')
    // The base hidden lives in the sheet, where a condition can override it.
    const html = renderPageHtml(ir, 'p')
    expect(html).not.toMatch(/data-entity="v"[^>]*style="display:none"/)
    expect(html).not.toContain('data-prop-conditions')
  })

  it('compiles motion into transitions and @starting-style', () => {
    const css = renderStyleCss(build([
      { id: 'a', kind: 'box', props: { hidden: true, appear: { opacity: 0, transform: 'translateY(8px)', ms: 500 }, leave: { opacity: 0, ms: 300 }, conditions: { 'open=true': { hidden: false } } } },
    ]))
    expect(css).toContain('@media (prefers-reduced-motion:no-preference){[data-entity="a"]{transition:opacity 500ms')
    expect(css).toContain('display 500ms allow-discrete')
    expect(css).toContain('@starting-style{[data-entity="a"]{opacity:0;transform:translateY(8px)}}')
    expect(css).toContain('[data-entity="a"]{display:none;opacity:0}')
  })

  it('styles list rows by template and by position', () => {
    const ir = build([
      { id: 'log', kind: 'list', template: 'line', bind: { prop: '*', source: 'log', shape: { key: 'id' } } },
      { id: 'line', kind: 'box', kids: ['line-text'], props: { conditions: { ':last': { opacity: 1 } } } },
      { id: 'line-text', kind: 'text', props: { content: '*text', conditions: { ':fromEnd(2)': { color: '#999' } } } },
    ], ['log'])
    const css = renderStyleCss(ir)
    expect(css).toContain('[data-entity="line"]:last-child,[data-tpl="line"]:last-child{opacity:1}')
    expect(css).toContain('[data-tpl="line"]:nth-last-child(2) [data-entity="line-text"],[data-tpl="line"]:nth-last-child(2) [data-tpl="line-text"]{color:#999}')
    const live = buildManifest(ir, 'p').live!
    expect(live.lists['log']).toMatchObject({ source: 'log', key: 'id', template: 'line', fields: { 'line-text': { content: '*text' } } })
    expect(live.lists['log']!.html).toContain('data-entity="line-text"')
  })
})

describe('declared state', () => {
  it('reflects the keys conditions read and restores them before paint', () => {
    const ir = build([{ id: 'v', kind: 'box', props: { hidden: true, conditions: { 'view=work': { hidden: false } } } }])
    ir.stateDefaults = { view: 'pick' }
    ir.stateDecls.set('view', { address: 'view', keep: 'session' })
    const live = buildManifest(ir, 'p').live!
    expect(live.state.reflect).toEqual(['view'])
    expect(live.state.initial).toEqual({ view: 'pick' })
    const html = renderPageHtml(ir, 'p')
    // The pre-paint script is the first thing in <body>.
    expect(html).toMatch(/<body[^>]*>\n<script>\(function\(\)\{try\{var L=\{"p":"p","r":\["view"\]/)
  })

  it('marks behaviours on the element', () => {
    const html = renderPageHtml(build([
      { id: 'c', kind: 'box', props: { acceptsFiles: true, easesHeight: true } },
      { id: 'b', kind: 'button', props: { label: '+', browsesFilesFor: 'c' } },
      { id: 'g', kind: 'box', props: { drags: 'panel' } },
    ]), 'p')
    expect(html).toMatch(/data-entity="c"[^>]*data-accepts-files[^>]*data-morph/)
    expect(html).toContain('data-browse-files="c"')
    expect(html).toContain('data-drags="panel"')
  })
})

describe('key events', () => {
  it('normalises combos the way the page reports them', async () => {
    const { canonicalEvent } = await import('../bindings')
    expect(canonicalEvent('key:mod+enter')).toBe('key:Mod+Enter')
    expect(canonicalEvent('key:Shift+ctrl+k')).toBe('key:Mod+Shift+K')
    expect(canonicalEvent('key:Escape')).toBe('key:Escape')
    expect(canonicalEvent('filesadded')).toBe('filesAdded')
  })
})
