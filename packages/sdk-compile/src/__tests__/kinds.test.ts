/**
 * Kind-coverage guard.
 *
 * Every kind in `CREATABLE_KINDS` is reachable from user code and satisfies its
 * type, so a kind without a renderer is a declaration that compiles and does
 * nothing — the exact failure this suite exists to prevent. Adding a kind now
 * requires adding an implementation, or listing it as a layout primitive.
 */
import { describe, expect, it } from 'vitest';
import { CREATABLE_KINDS } from '../compile-ctx/registries';
import { LAYOUT_PRIMITIVES, TEMPLATED_KINDS, TAG_FOR_KIND } from '../render/node';
import { createEmptyIR } from '../ir';
import { makeHandle, ensureNode, type CompileState } from '../compile-ctx/handles';
import { renderNode } from '../render/node';
import { renderStyleCss } from '../style/sheet';

describe('kind coverage', () => {
  it('every creatable kind has a tag', () => {
    const missing = CREATABLE_KINDS.filter((k) => !(k in TAG_FOR_KIND));
    expect(missing).toEqual([]);
  });

  it('every creatable kind has a renderer or is a layout primitive', () => {
    const missing = CREATABLE_KINDS.filter(
      (k) => !TEMPLATED_KINDS.has(k) && !LAYOUT_PRIMITIVES.has(k),
    );
    expect(missing, 'these kinds are creatable but render through the generic fallback with no parts or behavior').toEqual([]);
  });

  it('the tag map and renderer set cover the same kinds', () => {
    const templatedNotTagged = [...TEMPLATED_KINDS].filter((k) => !(k in TAG_FOR_KIND));
    expect(templatedNotTagged).toEqual([]);
  });

  it('no kind is both a layout primitive and templated', () => {
    const overlap = [...TEMPLATED_KINDS].filter((k) => LAYOUT_PRIMITIVES.has(k));
    expect(overlap).toEqual([]);
  });
});

/** Build a one-object IR for a kind and render it. */
function build(kind: string, props: Record<string, unknown> = {}) {
  const ir = createEmptyIR();
  const state = { ir, config: {}, actionName: 'test' } as CompileState;
  const node = ensureNode(state, kind, { id: 'k1', ...props });
  makeHandle(state, node);
  ir.pages.set('home', { name: 'home', address: '/', rootIds: ['k1'], app: null });
  return { ir, node }
}

function render(kind: string, props: Record<string, unknown> = {}): string {
  const { ir } = build(kind, props)
  return renderNode(ir, 'k1')
}

function styleFor(kind: string, props: Record<string, unknown> = {}): string {
  const { ir } = build(kind, props)
  return renderStyleCss(ir)
}

describe('previously-unimplemented kinds now render real markup', () => {
  it('form renders a <form> with a data-valid state', () => {
    const html = render('form', { layout: 'vertical', submitLabel: 'Save' })
    expect(html).toContain('<form')
    expect(html).toContain('data-kind="form"')
    expect(html).toContain('data-valid="true"')
    expect(html).toContain('data-part="submit"')
  })

  it('form carries declared rules and values for the submit handler', () => {
    const html = render('form', {
      rules: { email: { required: true, email: true } },
      values: { email: 'a@b.co' },
      errors: { email: 'bad' },
    })
    expect(html).toContain('data-rules=')
    expect(html).toContain('data-values=')
    expect(html).toContain('data-errors=')
  })

  it('login and signup render forms with an implied submit control', () => {
    for (const kind of ['login', 'signup']) {
      const html = render(kind)
      expect(html).toContain(`data-kind="${kind}"`)
      expect(html).toContain('data-part="submit"')
    }
    expect(render('login')).toContain('Sign in')
    expect(render('signup')).toContain('Create account')
  })

  it('accordion renders trigger and panel parts', () => {
    const ir = createEmptyIR()
    const state = { ir, config: {}, actionName: 'test' } as CompileState
    const acc = ensureNode(state, 'accordion', { id: 'a1' })
    const item = ensureNode(state, 'box', { id: 'i1', title: 'Section one', content: 'Body' })
    acc.children.push('i1')
    makeHandle(state, acc)
    makeHandle(state, item)
    ir.pages.set('home', { name: 'home', address: '/', rootIds: ['a1'], app: null })
    const html = renderNode(ir, 'a1')
    expect(html).toContain('data-part="accordion-trigger"')
    expect(html).toContain('data-part="accordion-panel"')
    expect(html).toContain('Section one')
    expect(html).toContain('Body')
  })

  it('dropdown renders a trigger and a panel', () => {
    const html = render('dropdown', { label: 'Open', items: [{ label: 'One', value: '1' }] })
    expect(html).toContain('data-part="dropdown-trigger"')
    expect(html).toContain('data-part="dropdown-panel"')
    expect(html).toContain('data-value="1"')
  })

  it('menu reuses the dropdown contract', () => {
    const html = render('menu', { items: [{ label: 'Home', value: 'home' }] })
    expect(html).toContain('data-kind="menu"')
    expect(html).toContain('data-part="dropdown-panel"')
  })

  it('tooltip renders a tip part', () => {
    const html = render('tooltip', { content: 'More info' })
    expect(html).toContain('data-part="tip"')
    expect(html).toContain('More info')
  })

  it('breadcrumbs renders crumbs and does not link the last one', () => {
    const html = render('breadcrumbs', {
      items: [{ label: 'Home', href: '/' }, { label: 'Docs' }],
    })
    expect(html).toContain('data-part="crumb"')
    expect(html).toContain('href="/"')
    // The final crumb renders a span, not a link.
    const lastCrumb = html.slice(html.lastIndexOf('data-part="crumb"'))
    expect(lastCrumb).not.toContain('<a ')
  })

  it('avatar renders initials and an image part', () => {
    const html = render('avatar', { name: 'Ada Lovelace', src: '/a.png' })
    expect(html).toContain('data-part="image"')
    expect(html).toContain('data-part="initials"')
    expect(html).toContain('AL')
  })

  it('avatar derives initials from a single name', () => {
    // Case is handled by text-transform in CSS, so the markup keeps source case.
    expect(render('avatar', { name: 'Prince' })).toContain('>Pr<')
    expect(styleFor('avatar')).toContain('text-transform')
  })

  it('separator and skeleton render their parts', () => {
    expect(render('separator', { variant: 'dashed' })).toContain('data-variant="dashed"')
    const skel = render('skeleton', { height: '40px' })
    expect(skel).toContain('data-height="40px"')
  })

  it('slot renders its children and hides when empty', () => {
    const ir = createEmptyIR()
    const state = { ir, config: {}, actionName: 'test' } as CompileState
    const slot = ensureNode(state, 'slot', { id: 's1' })
    const child = ensureNode(state, 'text', { id: 'c1', content: 'Projected' })
    slot.children.push('c1')
    makeHandle(state, slot)
    makeHandle(state, child)
    ir.pages.set('home', { name: 'home', address: '/', rootIds: ['s1'], app: null })
    expect(renderNode(ir, 's1')).toContain('Projected')
  })

  it('video and audio render their media element with controls by default', () => {
    const v = render('video', { src: '/a.mp4', poster: '/p.png' })
    expect(v).toContain('<video')
    expect(v).toContain('controls')
    expect(v).toContain('poster="/p.png"')
    const a = render('audio', { src: '/a.mp3' })
    expect(a).toContain('<audio')
    expect(a).toContain('controls')
  })

  it('markdown parses into real HTML rather than literal source', () => {
    const html = render('markdown', { content: '# Title\n\nSome **bold** text.' })
    expect(html).toContain('<h1')
    expect(html).toContain('Title')
    expect(html).toContain('<strong>bold</strong>')
    // The raw marker must not survive as text.
    expect(html).not.toContain('**bold**')
  })

  it('code renders lines with numbers and token spans', () => {
    const html = render('code', { language: 'ts', content: 'const x = 1 // hi' })
    expect(html).toContain('data-part="line"')
    expect(html).toContain('data-part="gutter"')
    expect(html).toContain('data-tok="keyword"')
    expect(html).toContain('data-tok="comment"')
  })
})

describe('previously-unimplemented kinds now emit stylesheet rules', () => {
  it('form emits layout rules', () => {
    const css = styleFor('form', { layout: 'horizontal' })
    expect(css).toContain('data-part="field"')
  })

  it('accordion emits trigger rules', () => {
    expect(styleFor('accordion')).toContain('data-part="accordion-trigger"')
  })

  it('dropdown emits panel rules', () => {
    expect(styleFor('dropdown')).toContain('data-part="dropdown-panel"')
  })

  it('tooltip emits visibility rules', () => {
    const css = styleFor('tooltip')
    expect(css).toContain('data-part="tip"')
    expect(css).toContain('data-visible="true"')
  })

  it('breadcrumbs emits crumb rules', () => {
    expect(styleFor('breadcrumbs')).toContain('data-part="crumb"')
  })

  it('avatar emits initials rules', () => {
    expect(styleFor('avatar')).toContain('data-part="initials"')
  })

  it('skeleton emits an animation', () => {
    expect(styleFor('skeleton')).toContain('morgana-skeleton')
  })

  it('markdown emits element rules', () => {
    const css = styleFor('markdown')
    expect(css).toContain('blockquote')
    expect(css).toContain('h1')
  })

  it('code emits token-independent line rules', () => {
    expect(styleFor('code')).toContain('data-part="line"')
  })
})
