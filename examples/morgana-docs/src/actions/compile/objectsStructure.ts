import { defineClientAction } from '@studiomorgana/sdk'
import { placeShell, placeView } from '../../nav'

/**
 * Structure objects — layout primitives, semantic shells, login/signup,
 * lister, slot. These render through the generic path (element + per-object
 * CSS), so the views prove layout props land: flip the knobs, watch the box.
 */
export const objectsStructure = defineClientAction({
  config: { on: 'compile' },
  handler: (ctx) => {
    const page = ctx.ui.pages.create({
      name: 'objects-structure',
      address: 'objects-structure',
      title: 'Structure objects — Morgana Docs',
      favicon: '/assets/favicon.svg',
    })
    page.app('main')
    const content = placeShell(ctx, page, 'structure', 'Structure objects', 'Layout primitives, semantic shells, and form variants — live, with knobs.')

    // ── Stacks ──
    {
      const { stage } = placeView(ctx, content, 'stack', 'Stacks & grid', 'One hstack target: flip its direction, gap, and background live. vstack/grid share the engine.', [
        { id: 'd-stack-layout', kind: 'select', label: 'layout', options: ['row', 'col'], value: 'row' },
        { id: 'd-stack-gap', kind: 'select', label: 'gap', options: ['1', '2', '4', '6'], value: '2' },
        { id: 'd-stack-bg', kind: 'select', label: 'bg', options: ['#FFFFFF', '#F5F3FF', '#FEF3C7'], value: '#FFFFFF' },
      ])
      const target = ctx.ui.hstack({ id: 'd-stack-target' })
      target.setProps({ gap: 2, pad: 3, bg: '#FFFFFF' })
      target.make('card')
      for (const label of ['One', 'Two', 'Three']) {
        const cell = ctx.ui.box({ id: `d-stack-cell-${label.toLowerCase()}` })
        cell.setProps({ pad: 3, bg: '#F5F3FF' })
        cell.place(ctx.ui.text({ id: `d-stack-cell-${label.toLowerCase()}-t`, content: label, font: 'body-me' }))
        target.place(cell)
      }
      stage.place(target)
    }

    // ── Surfaces ──
    {
      const { stage } = placeView(ctx, content, 'surface', 'Surfaces', 'container, card, group, stage — same Box engine, distinct intent.', [])
      const row = ctx.ui.box({ id: 'd-surface-row' })
      row.setProps({ layout: 'row', gap: 2, wrap: true })
      const kinds: Array<[string, string]> = [['container', 'Container'], ['card', 'Card'], ['group', 'Group'], ['stage', 'Stage']]
      for (const [kind, label] of kinds) {
        const maker = (ctx.ui as any)[kind]
        const surf = maker({ id: `d-surf-${kind}` })
        surf.setProps({ pad: 3, bg: '#FFFFFF' })
        surf.make('card')
        surf.place(ctx.ui.text({ id: `d-surf-${kind}-t`, content: label, font: 'body-me' }))
        row.place(surf)
      }
      stage.place(row)
    }

    // ── Semantic ──
    {
      const { stage } = placeView(ctx, content, 'semantic', 'Semantic shells', 'header, nav, main, section, article, footer — real landmarks, not divs.', [])
      const shell = ctx.ui.box({ id: 'd-semantic-demo' })
      shell.setProps({ layout: 'col', gap: 1 })
      const head = ctx.ui.header({ id: 'd-semantic-header' })
      head.place(ctx.ui.text({ id: 'd-semantic-header-t', content: 'header', font: 'caption' }))
      const nv = ctx.ui.nav({ id: 'd-semantic-nav' })
      nv.place(ctx.ui.text({ id: 'd-semantic-nav-t', content: 'nav', font: 'caption' }))
      const mn = ctx.ui.main({ id: 'd-semantic-main' })
      const sec = ctx.ui.section({ id: 'd-semantic-section' })
      const art = ctx.ui.article({ id: 'd-semantic-article' })
      art.place(ctx.ui.text({ id: 'd-semantic-article-t', content: 'article in a section in main', font: 'body' }))
      sec.place(art)
      mn.place(sec)
      const ft = ctx.ui.footer({ id: 'd-semantic-footer' })
      ft.place(ctx.ui.text({ id: 'd-semantic-footer-t', content: 'footer', font: 'caption' }))
      shell.place(head)
      shell.place(nv)
      shell.place(mn)
      shell.place(ft)
      stage.place(shell)
    }

    // ── Login / Signup / Lister ──
    {
      const { stage } = placeView(ctx, content, 'variants', 'Form & list variants', 'login and signup run the full form contract; lister runs the list contract.', [])
      const row = ctx.ui.box({ id: 'd-variants-row' })
      row.setProps({ layout: 'row', gap: 2, wrap: true })
      const login = ctx.ui.login({ id: 'd-variants-login', layout: 'vertical' })
      login.place(ctx.ui.input({ id: 'd-variants-user', name: 'user', placeholder: 'user', value: '' }))
      row.place(login)
      const lister = ctx.ui.lister({ id: 'd-variants-lister' })
      row.place(lister)
      stage.place(row)
      stage.place(ctx.ui.button({ id: 'd-variants-add', label: 'Append row', variant: 'outline' }))
      stage.place(ctx.ui.text({ id: 'd-variants-out', content: 'form values appear here', font: 'mono' }))
      stage.place(ctx.ui.button({ id: 'd-variants-read', label: 'Read login values', variant: 'outline' }))
    }

    return { ok: true }
  },
})
