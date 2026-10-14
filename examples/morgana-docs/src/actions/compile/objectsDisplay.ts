import { defineClientAction } from '@morgana/sdk'
import { placeShell, placeView } from '../../nav'

/**
 * Display objects — steps, timeline, stat, tag. Progress-style state
 * (steps current) and text writes (stat, tag) are live; timeline is a
 * compile-rendered list with a setItems writer for late data.
 */
export const objectsDisplay = defineClientAction({
  config: { on: 'compile' },
  handler: (ctx) => {
    const page = ctx.ui.pages.create({
      name: 'objects-display',
      address: 'objects-display',
      title: 'Display objects — Morgana Docs',
      favicon: '/assets/favicon.svg',
    })
    page.app('main')
    const content = placeShell(ctx, page, 'display', 'Display objects', 'Steps, timeline, stat, tag — live, with knobs.')

    // ── Steps ──
    {
      const { stage } = placeView(ctx, content, 'steps', 'Steps', 'Current step drives done/current/todo. Buttons and knob agree.', [
        { id: 'd-steps-current', kind: 'select', label: 'current', options: ['0', '1', '2'], value: '0' },
      ])
      const row = ctx.ui.box({ id: 'd-steps-btns' })
      row.setProps({ layout: 'row', gap: 2 })
      row.place(ctx.ui.button({ id: 'd-steps-prev', label: '← Prev', variant: 'outline' }))
      row.place(ctx.ui.button({ id: 'd-steps-next', label: 'Next →', variant: 'outline' }))
      stage.place(row)
      stage.place(
        ctx.ui.steps({
          id: 'd-steps-target',
          current: 0,
          items: [
            { key: 'cart', title: 'Cart', description: 'Pick your items' },
            { key: 'ship', title: 'Shipping', description: 'Where it goes' },
            { key: 'pay', title: 'Payment', description: 'How you pay' },
          ],
        }),
      )
    }

    // ── Timeline ──
    {
      const { stage } = placeView(ctx, content, 'timeline', 'Timeline', 'Events down a rail. Static showcase plus a reload-items button proving setItems.', [])
      const row = ctx.ui.box({ id: 'd-timeline-btns' })
      row.setProps({ layout: 'row', gap: 2 })
      row.place(ctx.ui.button({ id: 'd-timeline-reload', label: 'Reload items', variant: 'outline' }))
      stage.place(row)
      stage.place(
        ctx.ui.timeline({
          id: 'd-timeline-target',
          items: [
            { title: 'Shipped', time: '09:41', content: 'v0.3 left the dock' },
            { title: 'Verified', time: '10:02', content: '333 tests green' },
          ],
        }),
      )
    }

    // ── Stat ──
    {
      const { stage } = placeView(ctx, content, 'stat', 'Stat', 'Label, value, delta with trend arrow. All three knobs write live.', [
        { id: 'd-stat-value', kind: 'input', label: 'value', value: '1,024' },
        { id: 'd-stat-delta', kind: 'input', label: 'delta', value: '+12%' },
        { id: 'd-stat-trend', kind: 'select', label: 'trend', options: ['up', 'down', 'flat'], value: 'up' },
      ])
      stage.place(
        ctx.ui.stat({
          id: 'd-stat-target',
          label: 'Active users',
          value: '1,024',
          delta: '+12%',
          trend: 'up',
          helpText: 'vs last week',
        }),
      )
    }

    // ── Tag ──
    {
      const { stage } = placeView(ctx, content, 'tag', 'Tag', 'Label, variant, close. The × removes the tag through the same delegation badges use.', [
        { id: 'd-tag2-label', kind: 'input', label: 'label', value: 'Beta' },
        { id: 'd-tag2-variant', kind: 'select', label: 'variant', options: ['subtle', 'solid', 'outline', 'surface'], value: 'subtle' },
      ])
      stage.place(ctx.ui.tag({ id: 'd-tag2-target', label: 'Beta', variant: 'subtle', closable: true }))
    }

    // ── Combobox ──
    {
      const { stage } = placeView(ctx, content, 'combo', 'Combobox', 'Type to filter, pick an option, Esc/outside closes. The log hears picks.', [
        { id: 'd-combo-value', kind: 'input', label: 'set value', value: '' },
      ])
      stage.place(
        ctx.ui.combobox({
          id: 'd-combo-target',
          placeholder: 'Pick a fruit…',
          options: [
            { label: 'Apple', value: 'apple' },
            { label: 'Banana', value: 'banana' },
            { label: 'Cherry', value: 'cherry' },
            { label: 'Date', value: 'date', disabled: true },
          ],
        }),
      )
    }

    // ── Tags input ──
    {
      const { stage } = placeView(ctx, content, 'tags', 'Tags input', 'Type + Enter to commit, Backspace to drop the last, × per tag. Capped at 5.', [])
      const row = ctx.ui.box({ id: 'd-tags-btns' })
      row.setProps({ layout: 'row', gap: 2 })
      row.place(ctx.ui.button({ id: 'd-tags-clear', label: 'Clear', variant: 'outline' }))
      stage.place(row)
      stage.place(ctx.ui.tagsInput({ id: 'd-tags-target', placeholder: 'Add a tag…', max: 5 }))
    }

    // ── Tree ──
    {
      const { stage } = placeView(ctx, content, 'tree', 'Tree view', 'Carets expand, labels select. Buttons drive the same paths programmatically.', [])
      const row = ctx.ui.box({ id: 'd-tree-btns' })
      row.setProps({ layout: 'row', gap: 2, wrap: true })
      row.place(ctx.ui.button({ id: 'd-tree-expand', label: 'Expand all', variant: 'outline' }))
      row.place(ctx.ui.button({ id: 'd-tree-collapse', label: 'Collapse all', variant: 'outline' }))
      stage.place(row)
      stage.place(
        ctx.ui.treeView({
          id: 'd-tree-target',
          items: [
            { key: 'src', label: 'src', defaultExpanded: true, children: [
              { key: 'src-actions', label: 'actions', children: [
                { key: 'src-client', label: 'client' },
                { key: 'src-server', label: 'server' },
              ] },
              { key: 'src-nav', label: 'nav.ts' },
            ] },
            { key: 'assets', label: 'assets' },
          ],
        }),
      )
    }

    // ── Rating ──
    {
      const { stage } = placeView(ctx, content, 'rate', 'Rating', 'Click a star. Hover previews through pure CSS; the log hears commits.', [
        { id: 'd-rate-value', kind: 'select', label: 'value', options: ['0', '1', '2', '3', '4', '5'], value: '3' },
      ])
      stage.place(ctx.ui.rating({ id: 'd-rate-target', value: 3, max: 5 }))
    }

    // ── Editable ──
    {
      const { stage } = placeView(ctx, content, 'edit', 'Editable', 'Click the text to edit, Enter or blur submits, Esc cancels.', [
        { id: 'd-edit-value', kind: 'input', label: 'set value', value: '' },
      ])
      stage.place(ctx.ui.editable({ id: 'd-edit-target', value: 'Click me to edit' }))
    }

    // ── File upload ──
    {
      const { stage } = placeView(ctx, content, 'files', 'File upload', 'Browse or drop files. Names and sizes list locally — contents never leave your machine.', [])
      stage.place(ctx.ui.fileUpload({ id: 'd-files-target' }))
    }

    return { ok: true }
  },
})
