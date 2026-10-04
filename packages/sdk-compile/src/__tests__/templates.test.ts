/**
 * Templates — every object kind renders its full prop interface.
 * Builds IR directly (no ts.program), so this file stays fast.
 */
import { describe, expect, it } from 'vitest'
import { createEmptyIR, type ProjectIR } from '../ir'
import { renderPageHtml } from '../render/page'
import { renderStyleCss } from '../style/sheet'

interface Spec {
  id: string
  kind: string
  props?: Record<string, unknown>
  kids?: string[]
  template?: string
}

function build(specs: Spec[], pageProps: Record<string, unknown> = {}): ProjectIR {
  const ir = createEmptyIR()
  for (const s of specs) {
    ir.objects.set(s.id, {
      id: s.id,
      kind: s.kind,
      props: { id: s.id, ...(s.props ?? {}) },
      children: s.kids ?? [],
      parentId: null,
      contentTemplateId: (s as { template?: string }).template ?? null,
      bindings: [],
      breakpointProps: {},
      tracked: [],
      inlineWhens: [],
    })
  }
  ir.objects.set('p', { id: 'p', kind: 'page', props: { id: 'p', ...pageProps }, children: [], parentId: null, contentTemplateId: null, bindings: [], breakpointProps: {}, tracked: [], inlineWhens: [] })
  ir.pages.set('p', { name: 'p', address: '/', rootIds: specs.filter((s) => s.id !== 'p').map((s) => s.id), app: null })
  return ir
}

const html = (ir: ProjectIR): string => renderPageHtml(ir, 'p')
const css = (ir: ProjectIR): string => renderStyleCss(ir)

describe('button', () => {
  it('renders type/disabled/provider/icon slots, drops icon props from carriers', () => {
    const h = html(build([{ id: 'b', kind: 'button', props: { label: 'Go', type: 'submit', disabled: true, provider: 'shop', variant: 'danger', icon: '★', iconPosition: 'right' } }]))
    expect(h).toContain('type="submit"')
    expect(h).toContain('disabled')
    expect(h).toContain('data-provider="shop"')
    expect(h).toContain('Go<span data-part="icon"')
    expect(h).not.toContain('data-prop-icon')
    expect(h).not.toContain('data-prop-iconPosition')
    expect(css(build([{ id: 'b', kind: 'button', props: { variant: 'danger' } }]))).toContain('background:#DC2626')
  })
})

describe('field', () => {
  it('emits real input attrs, error node with a11y wiring, icon wrapper', () => {
    const h = html(build([{ id: 'i', kind: 'input', props: { type: 'email', name: 'em', placeholder: 'you@x.io', min: '1', max: '9', step: '1', disabled: true, error: 'Bad email', icon: '✉' } }]))
    expect(h).toContain('type="email"')
    expect(h).toContain('name="em"')
    expect(h).toContain('placeholder="you@x.io"')
    expect(h).toContain('aria-invalid="true"')
    expect(h).toContain('aria-describedby="err-i"')
    expect(h).toContain('<div data-part="error" id="err-i" role="alert">Bad email</div>')
    expect(h).toContain('data-kind="input-wrap"')
    // Entity identity stays on the field, not the wrapper.
    expect(h.match(/data-entity="i"/g)).toHaveLength(1)
  })

  it('renders textarea values', () => {
    expect(html(build([{ id: 't', kind: 'textarea', props: { value: 'hi <there>' } }]))).toContain('<textarea data-entity="t" data-kind="textarea">hi &lt;there&gt;</textarea>')
  })
})

describe('select', () => {
  it('renders options, placeholder, multiple, preselection', () => {
    const h = html(build([{ id: 's', kind: 'select', props: { name: 'c', options: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b', disabled: true }], value: 'b' } }]))
    expect(h).toContain('name="c"')
    expect(h).toContain('<option value="b" selected disabled>B</option>')
  })

  it('shows the placeholder option when nothing is selected', () => {
    const h = html(build([{ id: 's', kind: 'select', props: { placeholder: 'Pick', options: [{ label: 'A', value: 'a' }] } }]))
    expect(h).toContain('<option value="" disabled selected>Pick</option>')
  })

  it('preselects multiple values', () => {
    const h = html(build([{ id: 's', kind: 'select', props: { multiple: true, options: [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }], value: ['a', 'b'] } }]))
    expect(h).toContain('multiple')
    expect(h).toContain('<option value="a" selected>A</option>')
    expect(h).toContain('<option value="b" selected>B</option>')
  })
})

describe('table', () => {
  const cols = [
    { key: 'name', label: 'Name', sortable: true, align: 'left' },
    { key: 'total', label: 'Total', sortable: true, align: 'right', format: 'currency' },
    { key: 'active', label: 'On', format: 'boolean' },
  ]
  const rows = [
    { name: 'bravo', total: 20, active: false },
    { name: 'alpha', total: 5, active: true },
  ]

  it('renders caption/thead/tbody with formats', () => {
    const h = html(build([{ id: 't', kind: 'table', props: { columns: cols, rows, caption: 'Orders' } }]))
    expect(h).toContain('<caption>Orders</caption>')
    expect(h).toContain('data-column="total"')
    expect(h).toContain('data-sortable="true"')
    expect(h).toContain('data-align="right"')
    expect(h).toContain('$20.00')
    expect(h).toContain('—')
  })

  it('applies compile-time sorting + filtering', () => {
    const h = html(build([{ id: 't', kind: 'table', props: { columns: cols, rows, sorting: { key: 'total', direction: 'desc' } } }]))
    expect(h.indexOf('$20.00')).toBeLessThan(h.indexOf('$5.00'))
    const f = html(build([{ id: 't', kind: 'table', props: { columns: cols, rows, filtering: { search: 'alpha' } } }]))
    expect(f).not.toContain('$20.00')
    expect(f).toContain('$5.00')
  })

  it('shows emptyText and paginates', () => {
    expect(html(build([{ id: 't', kind: 'table', props: { columns: cols, rows: [], emptyText: 'Nothing here' } }]))).toContain('Nothing here')
    const h = html(build([{ id: 't', kind: 'table', props: { columns: cols, rows: [...rows, { name: 'c', total: 9, active: true }], pagination: { page: 2, pageSize: 2, showTotal: true } } }]))
    expect(h).toContain('data-part="pagination"')
    expect(h).toContain('3 total')
    expect(h).toContain('data-current="true">2<')
    expect(h).not.toContain('$20.00')
  })

  it('emits variant + density CSS', () => {
    const c = css(build([{ id: 't', kind: 'table', props: { variant: 'striped', density: 'compact' } }]))
    expect(c).toContain('tbody tr:nth-child(even)')
    expect(c).toContain('font-size:12px')
  })
})

describe('tabs', () => {
  it('renders items with active panel only', () => {
    const h = html(build([{ id: 't', kind: 'tabs', props: { activeKey: 'b', items: [{ key: 'a', label: 'A', content: 'AAA' }, { key: 'b', label: 'B', content: 'BBB', badge: 3 }, { key: 'c', label: 'C', disabled: true }] } }]))
    expect(h).toContain('data-tab-key="b" role="tab" data-active="true"')
    expect(h).toContain('data-part="panel" data-panel-key="b" role="tabpanel">BBB<')
    expect(h).toContain('data-part="panel" data-panel-key="a" role="tabpanel" hidden')
    expect(h).toContain('data-part="tab-badge">3<')
    expect(h).toContain('data-disabled="true"')
  })
})

describe('dialog', () => {
  it('hides closed dialogs, builds header/footer/overlay', () => {
    const h = html(build([{ id: 'd', kind: 'dialog', props: { title: 'Sure?', description: 'Really', confirmLabel: 'Yes', size: 'lg' } }]))
    expect(h).toContain('style="display:none"')
    expect(h).toContain('role="dialog" aria-modal="true"')
    expect(h).toContain('data-part="overlay" data-close="true"')
    expect(h).toContain('<div data-part="header">Sure?</div>')
    expect(h).toContain('data-part="confirm">Yes<')
    expect(css(build([{ id: 'd', kind: 'dialog', props: { size: 'lg' } }]))).toContain('max-width:720px')
  })

  it('shows open dialogs without dismiss affordances when opted out', () => {
    const h = html(build([{ id: 'd', kind: 'dialog', props: { open: true, dismissible: false } }]))
    expect(h).not.toContain('display:none')
    expect(h).not.toContain('data-part="dismiss"')
  })
})

describe('badge + alert', () => {
  it('badge label/variant/remove/dot', () => {
    const h = html(build([{ id: 'b', kind: 'badge', props: { label: 'New', variant: 'success', removable: true, dot: true } }]))
    expect(h).toContain('<span data-entity="b" data-kind="badge" data-prop-variant="success"><span data-part="dot" aria-hidden="true"></span>New')
    expect(h).toContain('data-part="remove"')
    expect(css(build([{ id: 'b', kind: 'badge', props: { variant: 'success' } }]))).toContain('background:#ECFDF5')
  })

  it('alert parts + dismiss + hidden', () => {
    const h = html(build([{ id: 'a', kind: 'alert', props: { title: 'T', description: 'D', variant: 'danger', dismissible: true, actionLabel: 'Fix' } }]))
    expect(h).toContain('data-part="title">T<')
    expect(h).toContain('data-part="description">D<')
    expect(h).toContain('data-part="action">Fix<')
    expect(h).toContain('data-part="dismiss"')
    expect(html(build([{ id: 'a', kind: 'alert', props: { visible: false } }]))).toContain('hidden')
  })
})

describe('image + toggle', () => {
  it('image attrs + fallback + fit CSS', () => {
    const h = html(build([{ id: 'i', kind: 'image', props: { src: 'a.png', alt: 'A', width: 40, height: 20, fallback: 'b.png' } }]))
    expect(h).toContain('src="a.png"')
    expect(h).toContain('width="40"')
    expect(h).toContain('onerror')
    expect(css(build([{ id: 'i', kind: 'image', props: { fit: 'cover', aspectRatio: '16/9' } }]))).toContain('object-fit:cover')
  })

  it('switch DOM with state-driven CSS', () => {
    const h = html(build([{ id: 's', kind: 'switch', props: { checked: true, label: 'On', size: 'lg', disabled: true } }]))
    expect(h).toContain('data-checked="true"')
    expect(h).toContain('data-part="track" role="switch" aria-checked="true"')
    expect(h).toContain('data-part="thumb"')
    expect(h).toContain('data-part="label">On<')
    expect(h).toContain('data-disabled="true"')
    const c = css(build([{ id: 's', kind: 'switch', props: { checked: true, size: 'lg' } }]))
    expect(c).toContain('[data-entity="s"] [data-part="track"]{width:56px')
    expect(c).toContain('[data-entity="s"][data-checked="true"] [data-part="track"]{background:var(--primary)}')
  })

  it('checkbox branch renders native input', () => {
    const h = html(build([{ id: 'c', kind: 'checkbox', props: { checked: true, label: 'Ok' } }]))
    expect(h).toContain('<input type="checkbox" checked')
    expect(h).toContain('data-part="label">Ok<')
  })
})

describe('list + chart + progress', () => {
  it('stamps bind templates per record with field renames', () => {
    const ir = build([
      { id: 'row', kind: 'text', props: { content: '*title' } },
      { id: 'feed', kind: 'list', props: { data: [{ name: 'n1' }, { name: 'n2' }] }, template: 'row' },
    ])
    ir.objects.get('feed')!.bindings = [{ prop: '*', source: 'items', shape: { key: 'name', fields: { title: 'name' } } }]
    const h = html(ir)
    expect(h).toContain('n1')
    expect(h).toContain('n2')
    expect(h).toContain('data-entity="feed__n1_row"')
  })

  it('interpolates embedded *placeholders inside template strings', () => {
    const ir = build([
      { id: 'row', kind: 'text', props: { content: '*name — $*total' } },
      { id: 'feed', kind: 'list', props: { data: [{ name: 'n1', total: 1 }] }, template: 'row' },
    ])
    const h = html(ir)
    expect(h).toContain('n1 — $1')
  })

  it('renders bar + pie SVG and empty states', () => {
    const bar = html(build([{ id: 'c', kind: 'chart', props: { kind: 'bar', series: [[3, 6]], labels: ['a', 'b'] } }]))
    expect(bar).toContain('<svg')
    expect(bar).toContain('<rect')
    const pie = html(build([{ id: 'c', kind: 'chart', props: { kind: 'pie', series: [[1, 1]] } }]))
    expect(pie).toContain('<path')
    expect(html(build([{ id: 'c', kind: 'chart', props: {} }]))).toContain('data-part="empty">No data<')
  })

  it('progress fill width + label + a11y', () => {
    const h = html(build([{ id: 'p2', kind: 'progress', props: { value: 25, max: 50, showLabel: true, striped: true, variant: 'sky' } }]))
    expect(h).toContain('role="progressbar"')
    expect(h).toContain('aria-valuenow="50"')
    expect(h).toContain('style="width:50%"')
    expect(h).toContain('data-striped="true"')
    expect(h).toContain('data-part="label">50%<')
    expect(css(build([{ id: 'p2', kind: 'progress', props: { variant: 'sky' } }]))).toContain('background:#0284C7')
  })
})

describe('page head + borders', () => {
  it('emits title/meta/favicon/viewport/theme', () => {
    const h = html(build([], { title: 'Shop', meta: 'Best shop', favicon: '/f.ico', viewport: 'fill', theme: 'dark' }))
    expect(h).toContain('<title>Shop</title>')
    expect(h).toContain('<meta name="description" content="Best shop" />')
    expect(h).toContain('<link rel="icon" href="/f.ico" />')
    expect(h).toContain('data-viewport="fill"')
    expect(h).toContain('data-theme="dark"')
  })

  it('resolves per-side borders', () => {
    const c = css(build([{ id: 'b', kind: 'box', props: { borderTop: true, borderBottom: 2, borderColor: 'red' } }]))
    expect(c).toContain('border-top:1px solid red')
    expect(c).toContain('border-bottom:2px solid red')
  })
})
