/**
 * Prop coverage.
 *
 * Every prop declared in the SDK's `props.ts` families must be read by a
 * renderer, the stylesheet, or a behavior. A declared prop that nothing reads
 * becomes a `data-prop-*` attribute no code ever looks at — a silent no-op.
 */
import { describe, expect, it } from 'vitest';
import { createEmptyIR } from '../ir';
import { ensureNode, makeHandle, type CompileState } from '../compile-ctx/handles';
import { renderNode } from '../render/node';
import { renderStyleCss } from '../style/sheet';
import { renderPageHtml } from '../render/page';
import { behaviorsPart } from '../client/behaviors';
import { resolveMakeToken } from '../compile-ctx/tokens';

function build(kind: string, props: Record<string, unknown>, id = 'k1') {
  const ir = createEmptyIR();
  const state = { ir, config: {}, actionName: 'test' } as CompileState;
  const node = ensureNode(state, kind, { id, ...props });
  makeHandle(state, node);
  ir.pages.set('home', { name: 'home', address: '/', rootIds: [id], app: null });
  return { ir, node }
}

const render = (kind: string, props: Record<string, unknown> = {}): string =>
  renderNode(build(kind, props).ir, 'k1')

const css = (kind: string, props: Record<string, unknown> = {}): string =>
  renderStyleCss(build(kind, props).ir)

describe('Select props are all read', () => {
  it('variant reaches the DOM', () => {
    expect(render('select', { variant: 'pill' })).toContain('data-variant="pill"')
  })

  it('searchable composes a select with a search part', () => {
    const html = render('select', { searchable: true, options: [{ label: 'A', value: 'a' }] })
    expect(html).toContain('data-part="search"')
    expect(html).toContain('data-part="option"')
    // No longer a native <select>, so options are divs.
    expect(html).not.toContain('<select')
  })

  it('clearable adds a clear control once a value is chosen', () => {
    const html = render('select', { clearable: true, value: 'a', options: [{ label: 'A', value: 'a' }] })
    expect(html).toContain('data-part="clear"')
  })

  it('isOpen is emitted', () => {
    expect(render('select', { isOpen: true })).toContain('data-open="true"')
  })

  it('select variants have part styles', () => {
    expect(css('select', { variant: 'pill' })).toContain('data-variant="pill"')
  })
})

describe('Tabs props are all read', () => {
  it('variant and orientation reach the DOM', () => {
    const html = render('tabs', { items: [{ key: 'a', label: 'A' }], variant: 'pill', orientation: 'vertical' })
    expect(html).toContain('data-variant="pill"')
    expect(html).toContain('data-orientation="vertical"')
  })

  it('vertical orientation has styles', () => {
    expect(css('tabs', { orientation: 'vertical' })).toContain('data-orientation="vertical"]')
  })

  it('default tabs emit line as the variant', () => {
    expect(render('tabs', { items: [{ key: 'a', label: 'A' }] })).toContain('data-variant="line"')
  })

  it('every declared tab variant has a style rule', () => {
    for (const v of ['line', 'pill', 'pills', 'enclosed', 'bordered']) {
      expect(css('tabs', { variant: v }), v).toContain(`data-variant="${v}"]`)
    }
  })
})

describe('Form props are all read', () => {
  it('layout, isValid, isSubmitting, values and errors are emitted', () => {
    const html = render('form', {
      layout: 'horizontal',
      isValid: false,
      isSubmitting: true,
      values: { a: 1 },
      errors: { a: 'bad' },
    })
    expect(html).toContain('data-layout="horizontal"')
    expect(html).toContain('data-valid="false"')
    expect(html).toContain('data-submitting="true"')
    expect(html).toContain('data-values=')
    expect(html).toContain('data-errors=')
  })

  it('all three layouts have distinct styles', () => {
    for (const l of ['vertical', 'horizontal', 'inline']) {
      expect(css('form', { layout: l }), l).toContain('flex-direction')
    }
  })
})

describe('Table props are all read', () => {
  const ROWS = [{ id: '1', name: 'A' }, { id: '2', name: 'B' }]
  const COLS = [{ key: 'id', label: 'ID' }, { key: 'name', label: 'Name', sortable: true, filterable: true }]

  it('selection mode emits a control column and per-row inputs', () => {
    const html = render('table', { columns: COLS, rows: ROWS, selection: { mode: 'multiple', selectedKeys: ['2'] } })
    expect(html).toContain('data-select-mode="multiple"')
    expect(html).toContain('data-part="select-cell"')
    expect(html).toContain('data-part="select"')
    // The pre-selected row is marked.
    expect(html).toContain('data-selected="true"')
  })

  it('single selection emits radio inputs', () => {
    const html = render('table', { columns: COLS, rows: ROWS, selection: { mode: 'single' } })
    expect(html).toContain('type="radio"')
  })

  it('stickyHeader and loading are emitted and styled', () => {
    const html = render('table', { columns: COLS, rows: ROWS, stickyHeader: true, loading: true })
    expect(html).toContain('data-sticky-header="true"')
    expect(html).toContain('data-loading="true"')
    expect(css('table', { stickyHeader: true, loading: true })).toContain('position:sticky')
  })

  it('caption renders', () => {
    expect(render('table', { columns: COLS, rows: ROWS, caption: 'Orders' })).toContain('<caption>Orders</caption>')
  })

  it('pageSizeOptions renders a size selector', () => {
    const html = render('table', {
      columns: COLS,
      rows: ROWS,
      pagination: { enabled: true, page: 1, pageSize: 1, pageSizeOptions: [1, 2] },
    })
    expect(html).toContain('data-part="page-size"')
    expect(html).toContain('data-page-size="1"')
  })

  it('filterable columns render a filter input', () => {
    expect(render('table', { columns: COLS, rows: ROWS })).toContain('data-part="column-filter"')
  })

  it('every declared table variant reaches the DOM', () => {
    for (const v of ['default', 'striped', 'bordered', 'cards', 'elevated', 'glass']) {
      const html = render('table', { columns: COLS, rows: ROWS, variant: v })
      expect(html, v).toContain(`data-variant="${v}"`)
    }
  })

  it('striped, cards, elevated and glass have distinct rules', () => {
    expect(css('table', { columns: COLS, rows: ROWS, variant: 'striped' })).toContain('nth-child(even)')
    expect(css('table', { columns: COLS, rows: ROWS, variant: 'cards' })).toContain('display:block')
    expect(css('table', { columns: COLS, rows: ROWS, variant: 'elevated' })).toContain('box-shadow')
    expect(css('table', { columns: COLS, rows: ROWS, variant: 'glass' })).toContain('backdrop-filter')
  })

  it('row selection has client behavior', () => {
    const js = behaviorsPart().join('\n')
    expect(js).toContain('input[data-part=\\"select\\"]')
    expect(js).toContain('data-selected')
  })
})

describe('Page props are all read', () => {
  it('headScript is emitted', () => {
    const { ir, node } = build('page', { headScript: 'window.x=1' }, 'home')
    expect(renderPageHtml(ir, 'home')).toContain('<script>window.x=1</script>')
    expect(node.kind).toBe('page')
  })

  it('tags become data attributes on the body', () => {
    const ir = createEmptyIR()
    const state = { ir, config: {}, actionName: 'test' } as CompileState
    const node = ensureNode(state, 'page', { id: 'home', address: '/', tags: { analytics: 'on', tier: 'pro' } })
    makeHandle(state, node)
    ir.pages.set('home', { name: 'home', address: '/', rootIds: [], app: null })
    const html = renderPageHtml(ir, 'home')
    expect(html).toContain('data-tag-analytics="on"')
    expect(html).toContain('data-tag-tier="pro"')
  })

  it('make("spa") produces an SPA shell', () => {
    const ir = createEmptyIR()
    const state = { ir, config: {}, actionName: 'test' } as CompileState
    const node = ensureNode(state, 'page', { id: 'home', address: '/' })
    makeHandle(state, node)
    applyMake(node, 'page', 'spa')
    ir.pages.set('home', { name: 'home', address: '/', rootIds: [], app: null })
    const html = renderPageHtml(ir, 'home')
    expect(html).toContain('data-spa="true"')
  })
})

/** Apply a make() token to a node's props, as a compile action would. */
function applyMake(node: { props: Record<string, unknown> }, kind: string, token: string): void {
  Object.assign(node.props, resolveMakeToken(kind, token))
}
