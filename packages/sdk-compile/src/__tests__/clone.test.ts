/**
 * clone() — end to end on the IR.
 *
 * The gap this locks in: clone copied the root's props and nothing else. It
 * dropped the child tree, dropped `customObject` (so a cloned component became
 * an inert box with no methods and no lifecycle), dropped inline whens, and
 * shared nested prop objects with the original. Every one of those compiled
 * cleanly and produced a half-object at runtime.
 *
 * These assertions are about the resulting graph: what the clone points at,
 * what it no longer shares, and that the original is untouched.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { createEmptyIR, type ObjNode } from '../ir'
import { compileProject } from '../index'
import { makeHandle, type CompileState } from '../compile-ctx/handles'

const CONFIG = [
  "import { defineConfig } from '@morgana/sdk'",
  "export default defineConfig({ name: 'clone', entry: 'home' })",
].join('\n')

const PLAYER = `
import { createCustomObject } from '@morgana/sdk'
export default createCustomObject({
  name: 'video-player',
  defaultProps: { src: '' },
  define: (handle, ctx) => {
    handle.place(ctx.ui.video({ id: 'video', src: String(ctx.props.src ?? '') }))
    handle.place(ctx.ui.text({ id: 'caption', content: 'clip' }))
  },
})
`

type Handle = Record<string, unknown> & { __nodeId: string }

/** Handle methods are recorded on a plain record, so call them through this. */
function m(h: Handle, name: string): (...args: unknown[]) => unknown {
  return h[name] as (...args: unknown[]) => unknown
}

function stateWith(): CompileState {
  return { ir: createEmptyIR(), config: {} as CompileState['config'], actionName: 'test' }
}

/** Minimal ObjNode registration — the tests only need the graph shape. */
function seedNode(ir: CompileState['ir'], kind: string, id: string): ObjNode {
  const node: ObjNode = {
    id, kind, props: {}, children: [], parentId: null,
    contentTemplateId: null, bindings: [], breakpointProps: {}, tracked: [], inlineWhens: [],
  }
  ir.objects.set(id, node)
  return node
}

describe('clone() copies the object, not just its props', () => {
  it('brings the whole child tree, each child with a fresh id', () => {
    const state = stateWith()
    const { ir } = state
    const page = seedNode(ir, 'page', 'home')
    const card = seedNode(ir, 'card', 'card1')
    const label = seedNode(ir, 'text', 'label1')
    const badge = seedNode(ir, 'badge', 'badge1')
    page.children.push('card1')
    card.parentId = 'home'
    card.children.push('label1', 'badge1')
    label.parentId = 'card1'
    badge.parentId = 'card1'

    const copy = m(makeHandle(state, card) as Handle, 'clone')({ id: 'card2' }) as Handle
    const copyNode = ir.objects.get('card2')!

    expect(copyNode.kind).toBe('card')
    expect(copyNode.children).toHaveLength(2)
    // Descendants are new objects, not aliases of the originals.
    for (const childId of copyNode.children) expect(ir.objects.has(childId)).toBe(true)
    expect(copyNode.children.some((c) => c === 'label1' || c === 'badge1')).toBe(false)

    // Parent/child is intact inside the clone…
    for (const childId of copyNode.children) expect(ir.objects.get(childId)!.parentId).toBe('card2')
    // …and the original tree is untouched.
    expect(ir.objects.get('card1')!.children).toEqual(['label1', 'badge1'])
    expect(ir.objects.get('home')!.children).toEqual(['card1'])
  })

  it('keeps component identity, so a cloned component is still a component', () => {
    const state = stateWith()
    const { ir } = state
    const src = seedNode(ir, 'box', 'player')
    src.customObject = 'video-player'
    src.props['src'] = '/clip.mp4'
    const video = seedNode(ir, 'video', 'video')
    video.customObject = 'video-player'
    src.children.push(video.id)
    video.parentId = src.id

    const copy = m(makeHandle(state, src) as Handle, 'clone')() as Handle
    const copyNode = ir.objects.get(copy.__nodeId)!

    // Without this the clone renders as a box and gets no methods, no
    // lifecycle, no state — a component that silently stopped being one.
    expect(copyNode.customObject).toBe('video-player')
    // And its interior came along, still stamped as part of the component.
    expect(copyNode.children).toHaveLength(1)
    expect(ir.objects.get(copyNode.children[0]!)!.customObject).toBe('video-player')
  })

  it('shares no prop object with the original', () => {
    const state = stateWith()
    const { ir } = state
    const src = seedNode(ir, 'box', 'b')
    src.props['style'] = { color: 'red', nested: { deep: 1 } }
    src.props['data'] = [{ a: 1 }]

    const copy = m(makeHandle(state, src) as Handle, 'clone')() as Handle
    const copyNode = ir.objects.get(copy.__nodeId)!

    expect(copyNode.props['style']).toEqual({ color: 'red', nested: { deep: 1 } })
    expect(copyNode.props['style']).not.toBe(src.props['style'])
    ;(copyNode.props['style'] as Record<string, unknown>)['color'] = 'blue'
    ;((copyNode.props['style'] as Record<string, Record<string, unknown>>)['nested'])['deep'] = 2
    expect(src.props['style']).toEqual({ color: 'red', nested: { deep: 1 } })
    expect((copyNode.props['data'] as unknown[])[0]).not.toBe((src.props['data'] as unknown[])[0])
  })

  it('carries bindings, breakpoint props and tracked events over', () => {
    const state = stateWith()
    const { ir } = state
    const src = seedNode(ir, 'list', 'l')
    src.bindings.push({ prop: '*', source: 'items', shape: { key: 'id', fields: { a: 'A' } } })
    src.breakpointProps['md'] = { layout: 'column' }
    src.tracked.push('clicked')

    const copy = m(makeHandle(state, src) as Handle, 'clone')() as Handle
    const copyNode = ir.objects.get(copy.__nodeId)!

    expect(copyNode.bindings).toEqual(src.bindings)
    expect(copyNode.bindings[0]).not.toBe(src.bindings[0])
    expect(copyNode.breakpointProps['md']).toEqual({ layout: 'column' })
    expect(copyNode.breakpointProps['md']).not.toBe(src.breakpointProps['md'])
    expect(copyNode.tracked).toEqual(['clicked'])
  })

  it('carries inline whens onto the clone, under the new id', () => {
    const state = stateWith()
    const { ir } = state
    const src = seedNode(ir, 'button', 'b')
    const handle = makeHandle(state, src)
    m(handle, 'when')('clicked', () => {})

    const copy = m(handle, 'clone')() as Handle
    const copyNode = ir.objects.get(copy.__nodeId)!

    expect(copyNode.inlineWhens).toEqual([{ objectId: copy.__nodeId, event: 'clicked' }])
    // Registered globally too, or the clone's handler is a note nobody reads.
    expect(ir.inlineWhens).toContainEqual({ objectId: copy.__nodeId, event: 'clicked' })
  })

  it('clones the content template rather than sharing it', () => {
    const state = stateWith()
    const { ir } = state
    const list = seedNode(ir, 'list', 'l')
    const row = seedNode(ir, 'text', 'row')
    row.props['content'] = 'x'
    const handle = makeHandle(state, list)
    m(handle, 'addContent')(makeHandle(state, row))
    expect(ir.objects.get('l')!.contentTemplateId).toBe('row')

    const copy = m(handle, 'clone')() as Handle
    const copyNode = ir.objects.get(copy.__nodeId)!
    expect(copyNode.contentTemplateId).not.toBe('row')
    expect(ir.objects.has(copyNode.contentTemplateId!)).toBe(true)
    expect(ir.objects.get(copyNode.contentTemplateId!)!.props['content']).toBe('x')
  })

  it('rewires a handle held in a prop to the clone, not the original', () => {
    const state = stateWith()
    const { ir } = state
    const host = seedNode(ir, 'box', 'host')
    const target = seedNode(ir, 'text', 'target')
    host.props['anchor'] = makeHandle(state, target)
    host.children.push('target')
    target.parentId = 'host'

    const copy = m(makeHandle(state, host) as Handle, 'clone')() as Handle
    const copyNode = ir.objects.get(copy.__nodeId)!
    const anchor = copyNode.props['anchor'] as Handle
    expect(anchor.__nodeId).not.toBe('target')
    expect(anchor.__nodeId).toBe(copyNode.children[0])
  })
})

describe('clone() argument handling', () => {
  it('applies extra options to the root props, and only the root', () => {
    const state = stateWith()
    const { ir } = state
    const card = seedNode(ir, 'card', 'c')
    const label = seedNode(ir, 'text', 'l')
    label.props['content'] = 'hi'
    card.children.push('l')
    label.parentId = 'c'

    const copy = m(makeHandle(state, card) as Handle, 'clone')({ label: 'Next', variant: 'ghost' }) as Handle
    const copyNode = ir.objects.get(copy.__nodeId)!
    expect(copyNode.props['label']).toBe('Next')
    expect(copyNode.props['variant']).toBe('ghost')
    expect(ir.objects.get(copyNode.children[0]!)!.props['label']).toBeUndefined()
  })

  it('never leaks `id` in as a prop', () => {
    const state = stateWith()
    const src = seedNode(state.ir, 'box', 'b')
    const copy = m(makeHandle(state, src) as Handle, 'clone')({ id: 'b2', color: 'red' }) as Handle
    const copyNode = state.ir.objects.get(copy.__nodeId)!
    expect(copyNode.id).toBe('b2')
    expect(copyNode.props['id']).toBe('b2')
  })

  it('refuses an id that is already taken instead of overwriting it', () => {
    const state = stateWith()
    const a = makeHandle(state, seedNode(state.ir, 'box', 'a'))
    seedNode(state.ir, 'box', 'taken')
    expect(() => m(a, 'clone')({ id: 'taken' })).toThrow(/already in use/)
    // The other object is still there.
    expect(state.ir.objects.has('taken')).toBe(true)
  })

  it('generates unique ids across repeated clones', () => {
    const state = stateWith()
    const card = seedNode(state.ir, 'card', 'c')
    const label = seedNode(state.ir, 'text', 'l')
    card.children.push('l')
    label.parentId = 'c'
    const handle = makeHandle(state, card)

    const seen = new Set<string>()
    for (let i = 0; i < 5; i++) {
      const copy = m(handle, 'clone')() as Handle
      const node = state.ir.objects.get(copy.__nodeId)!
      expect(seen.has(copy.__nodeId)).toBe(false)
      seen.add(copy.__nodeId)
      seen.add(node.children[0]!)
    }
    // Two originals (the card and its label) plus a two-node clone, five times over.
    expect(state.ir.objects.size).toBe(2 + 2 * 5)
  })

  it('leaves the clone unplaced until the caller places it', () => {
    const state = stateWith()
    const { ir } = state
    const page = seedNode(ir, 'page', 'home')
    const card = seedNode(ir, 'card', 'c')
    page.children.push('c')
    card.parentId = 'page'
    const handle = makeHandle(state, card)

    const copy = m(handle, 'clone')() as Handle
    expect(ir.objects.get(copy.__nodeId)!.parentId).toBeNull()
    expect(ir.objects.get('home')!.children).toEqual(['c'])

    m(makeHandle(state, ir.objects.get('home')!) as Handle, 'place')(copy)
    expect(ir.objects.get(copy.__nodeId)!.parentId).toBe('home')
    expect(ir.objects.get('home')!.children).toContain(copy.__nodeId)
  })

  it('copy() is clone()', () => {
    const state = stateWith()
    const src = seedNode(state.ir, 'card', 'c')
    const copy = m(makeHandle(state, src) as Handle, 'copy')({ id: 'c2' }) as Handle
    expect(copy.__nodeId).toBe('c2')
    expect(state.ir.objects.get('c2')!.kind).toBe('card')
  })

  it('passes closures through untouched — a derived value is not data', () => {
    const state = stateWith()
    const src = seedNode(state.ir, 'text', 't')
    const fn = (): string => 'live'
    src.props['content'] = fn
    const copy = m(makeHandle(state, src) as Handle, 'clone')() as Handle
    expect(state.ir.objects.get(copy.__nodeId)!.props['content']).toBe(fn)
  })
})

describe('a cloned component is still a component, on the real page', () => {
  it('renders its interior and keeps its data-object marker', async () => {
    const dir = fs.mkdtempSync(path.join(tmpdir(), 'morgana-clone-'))
    const write = (rel: string, text: string): void => {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
      fs.writeFileSync(path.join(dir, rel), text, 'utf8')
    }
    write('morgana.config.ts', CONFIG)
    write('src/objects/video-player.ts', PLAYER)
    write('src/actions/compile/seed.ts', [
      "import { defineClientAction } from '@morgana/sdk'",
      'export const seed = defineClientAction({',
      '  config: { on: "compile" },',
      '  handler: (ctx) => {',
      "    const p = ctx.ui.pages.create({ name: 'home', address: '/' })",
      "    const a = ctx.ui.videoPlayer({ id: 'a', src: '/one.mp4' })",
      '    p.place(a)',
      "    p.place(a.clone({ id: 'b', src: '/two.mp4' }))",
      '    return { ok: true }',
      '  },',
      '})',
    ].join('\n'))

    const result = await compileProject({ dir, outDir: path.join(dir, 'dist') })
    const html = fs.readFileSync(path.join(dir, 'dist', 'pages', 'home.html'), 'utf8')
    const manifest = JSON.parse(
      (/\<script id="__MORGANA_OBJECTS__" type="application\/json">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '{}').replace(
        /\\u003c/g,
        '<',
      ),
    ) as { objects: Record<string, { customObject?: string }> }

    // The clone kept the component name...
    expect(Object.keys(manifest.objects).filter((k) => k === 'a' || k === 'b').sort()).toEqual(['a', 'b'])
    expect(manifest.objects['b']!.customObject).toBe('video-player')
    // ...and rendered as the real thing, with its own interior under its own ids.
    // The original's ids are fixed by `define`, so the clone's are new.
    const entities = [...html.matchAll(/data-entity="([^"]*)"/g)].map((x) => x[1]!)
    expect(entities).toContain('a')
    expect(entities).toContain('b')
    expect(entities.filter((e) => e === 'video' || e === 'caption').length).toBe(2)
    expect(entities.some((e) => e.startsWith('video_') && e !== 'video')).toBe(true)
    expect(html.match(/data-object="video-player"/g)?.length).toBe(2)
    // The clone's props are its own: overriding the root did not touch the original.
    expect(html).toContain('/one.mp4')
    expect(html).toContain('/two.mp4')
    expect(result.warnings).toEqual([])
    fs.rmSync(dir, { recursive: true, force: true })
  }, 60_000)
})
