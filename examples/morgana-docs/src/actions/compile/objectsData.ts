import { defineClientAction } from '@studiomorgana/sdk'
import { placeShell, placeView } from '../../nav'

/**
 * Data objects — list, table, tabs, dialog, chart. Lists and tables carry
 * docs data (keyboard shortcuts); the chart gets a static dataset and every
 * kind knob — if a kind renders nothing, that is a logged framework gap.
 */
export const objectsData = defineClientAction({
  config: { on: 'compile' },
  handler: (ctx) => {
    const page = ctx.ui.pages.create({
      name: 'objects-data',
      address: 'objects-data',
      title: 'Data objects — Morgana Docs',
      favicon: '/assets/favicon.svg',
    })
    page.app('main')
    const content = placeShell(ctx, page, 'data', 'Data objects', 'List, table, tabs, dialog, chart — live, with knobs.')

    // ── List ──
    {
      const { stage } = placeView(ctx, content, 'rows', 'List', 'Append and clear rows from the UI. Click a row to log it.', [
        { id: 'd-rows-new', kind: 'input', label: 'new row', value: 'A new row' },
      ])
      const list = ctx.ui.list({ id: 'd-rows-target' })
      for (const label of ['First row', 'Second row', 'Third row']) list?.append?.({ label })
      stage.place(list)
      const row = ctx.ui.box({ id: 'd-rows-btns' })
      row.setProps({ layout: 'row', gap: 2 })
      row.place(ctx.ui.button({ id: 'd-rows-add', label: 'Add row', variant: 'primary' }))
      row.place(ctx.ui.button({ id: 'd-rows-clear', label: 'Clear', variant: 'outline' }))
      stage.place(row)
    }

    // ── Table ──
    {
      const { stage } = placeView(ctx, content, 'grid', 'Table', 'Docs shortcuts as data. Density, sticky header, selection.', [
        { id: 'd-grid-density', kind: 'select', label: 'density', options: ['compact', 'comfortable', 'spacious'], value: 'comfortable' },
        { id: 'd-grid-sticky', kind: 'toggle', label: 'stickyHeader', value: 'false' },
        { id: 'd-grid-select', kind: 'toggle', label: 'selection', value: 'false' },
      ])
      stage.place(
        ctx.ui.table({
          id: 'd-grid-target',
          columns: [
            { key: 'keys', label: 'Keys' },
            { key: 'does', label: 'Does' },
          ],
          rows: [
            { keys: 'make()', does: 'token shorthand styling' },
            { keys: 'bind()', does: 'data onto records' },
            { keys: 'when()', does: 'wire events' },
            { keys: 'animate.*', does: '17 motion presets' },
          ],
          density: 'comfortable',
        }),
      )
    }

    // ── Tabs ──
    {
      const { stage } = placeView(ctx, content, 'tabs', 'Tabs', 'Active tab, orientation, variant.', [
        { id: 'd-tabs-active', kind: 'select', label: 'activeKey', options: ['one', 'two', 'three'], value: 'one' },
        { id: 'd-tabs-orient', kind: 'select', label: 'orientation', options: ['horizontal', 'vertical'] },
        { id: 'd-tabs-variant', kind: 'select', label: 'variant', options: ['default', 'pill', 'underline'] },
      ])
      stage.place(
        ctx.ui.tabs({
          id: 'd-tabs-target',
          items: [
            { key: 'one', label: 'One' },
            { key: 'two', label: 'Two' },
            { key: 'three', label: 'Three' },
          ],
          activeKey: 'one',
        }),
      )
    }

    // ── Dialog ──
    {
      const { stage } = placeView(ctx, content, 'dialog', 'Dialog', 'Open it, change its title and variant while open.', [
        { id: 'd-dialog-title', kind: 'input', label: 'title', value: 'Are you sure?' },
        { id: 'd-dialog-variant', kind: 'select', label: 'variant', options: ['default', 'danger', 'drawer', 'confirm'] },
      ])
      stage.place(ctx.ui.button({ id: 'd-dialog-open', label: 'Open dialog', variant: 'primary' }))
      stage.place(
        ctx.ui.dialog({
          id: 'd-dialog-target',
          title: 'Are you sure?',
          description: 'This dialog is a live object. Dismiss it or change its knobs.',
          variant: 'default',
          dismissible: true,
          confirmLabel: 'Confirm',
          cancelLabel: 'Cancel',
        }),
      )
    }

    // ── Chart ──
    {
      const { stage } = placeView(ctx, content, 'chart', 'Chart', 'One dataset, every kind. A kind that draws nothing is a gap — the log says so.', [
        {
          id: 'd-chart-kind',
          kind: 'select',
          label: 'kind',
          options: ['bar', 'line', 'area', 'pie', 'donut', 'scatter'],
          value: 'bar',
        },
      ])
      stage.place(
        ctx.ui.chart({
          id: 'd-chart-target',
          kind: 'bar',
          series: [[12, 19, 8, 15]],
          labels: ['Box', 'Text', 'Button', 'Chart'],
        } as any),
      )
    }

    // ── Accordion ──
    {
      const { stage } = placeView(ctx, content, 'folds', 'Accordion', 'Items, single vs multiple, collapsible lock, variant, size. Click a trigger — the log hears it.', [
        { id: 'd-folds-multiple', kind: 'toggle', label: 'multiple', value: 'false' },
        { id: 'd-folds-collapse', kind: 'toggle', label: 'collapsible', value: 'true' },
        { id: 'd-folds-variant', kind: 'select', label: 'variant', options: ['outline', 'subtle', 'enclosed', 'plain'], value: 'outline' },
        { id: 'd-folds-size', kind: 'select', label: 'size', options: ['sm', 'md', 'lg'], value: 'md' },
      ])
      stage.place(
        ctx.ui.accordion({
          id: 'd-folds-target',
          items: [
            { key: 'one', title: 'First section', content: 'The first panel body. Open me, then open another — with multiple off, I close.' },
            { key: 'two', title: 'Second section', content: 'The second panel body. Turn multiple on and we stay open together.' },
            { key: 'three', title: 'Third section', content: 'Turn collapsible off and try to close the last open item — it refuses.' },
          ],
        }),
      )
    }

    // ── Dropdown ──
    {
      const { stage } = placeView(ctx, content, 'drop', 'Dropdown', 'Trigger + items. Open it, pick an item, drive the value from the knob — the log hears picks.', [
        { id: 'd-drop-value', kind: 'select', label: 'value', options: ['a', 'b', 'c'], value: 'a' },
      ])
      const row = ctx.ui.box({ id: 'd-drop-btns' })
      row.setProps({ layout: 'row', gap: 2 })
      row.place(ctx.ui.button({ id: 'd-drop-open', label: 'Open', variant: 'outline' }))
      stage.place(row)
      stage.place(
        ctx.ui.dropdown({
          id: 'd-drop-target',
          label: 'Pick one',
          items: [
            { label: 'Alpha', value: 'a' },
            { label: 'Beta', value: 'b' },
            { label: 'Gamma', value: 'c', disabled: true },
          ],
          value: 'a',
        }),
      )
    }

    // ── Menu ──
    {
      const { stage } = placeView(ctx, content, 'menu', 'Menu', 'Dropdown laid out horizontally, plus programmatic picking via selectItem.', [
        { id: 'd-menu-value', kind: 'select', label: 'value', options: ['x', 'y'], value: 'x' },
      ])
      const row = ctx.ui.box({ id: 'd-menu-btns' })
      row.setProps({ layout: 'row', gap: 2 })
      row.place(ctx.ui.button({ id: 'd-menu-pick', label: 'Pick Y via selectItem', variant: 'outline' }))
      stage.place(row)
      stage.place(
        ctx.ui.menu({
          id: 'd-menu-target',
          label: 'Menu',
          items: [
            { label: 'Ex', value: 'x' },
            { label: 'Why', value: 'y' },
          ],
          value: 'x',
        }),
      )
    }

    // ── Popover ──
    {
      const { stage } = placeView(ctx, content, 'pop', 'Popover', 'Trigger-anchored panel. Click the trigger, click outside, press Esc — the log hears it all.', [
        { id: 'd-pop-title', kind: 'input', label: 'title', value: 'Popover title' },
        { id: 'd-pop-place', kind: 'select', label: 'placement', options: ['top', 'bottom', 'left', 'right'], value: 'bottom' },
        { id: 'd-pop-size', kind: 'select', label: 'size', options: ['xs', 'sm', 'md', 'lg'], value: 'md' },
      ])
      stage.place(
        ctx.ui.popover({
          id: 'd-pop-target',
          triggerLabel: 'Open popover',
          title: 'Popover title',
          content: 'Anchored panel. Outside click and Esc close me.',
          placement: 'bottom',
        }),
      )
    }

    // ── Tooltip ──
    {
      const { stage } = placeView(ctx, content, 'tip', 'Tooltip', 'Hover or focus the trigger — or drive it from buttons. The log hears both.', [
        { id: 'd-tip-content', kind: 'input', label: 'content', value: 'Helpful tip' },
      ])
      const tip = ctx.ui.tooltip({ id: 'd-tip-target', content: 'Helpful tip', placement: 'top' })
      tip.place(ctx.ui.text({ id: 'd-tip-trigger-t', content: 'Hover or focus me', font: 'body-me' }))
      stage.place(tip)
      const row = ctx.ui.box({ id: 'd-tip-btns' })
      row.setProps({ layout: 'row', gap: 2 })
      row.place(ctx.ui.button({ id: 'd-tip-show', label: 'Show', variant: 'outline' }))
      row.place(ctx.ui.button({ id: 'd-tip-hide', label: 'Hide', variant: 'outline' }))
      stage.place(row)
    }

    // ── Drawer ──
    {
      const { stage } = placeView(ctx, content, 'draw', 'Drawer', 'Dialog’s edge-anchored sibling. Placement, size, dismiss — the log hears the close.', [
        { id: 'd-draw-place', kind: 'select', label: 'placement', options: ['start', 'end', 'top', 'bottom'], value: 'end' },
        { id: 'd-draw-size', kind: 'select', label: 'size', options: ['xs', 'sm', 'md', 'lg', 'xl', 'full'], value: 'md' },
        { id: 'd-draw-title', kind: 'input', label: 'title', value: 'Slide over' },
      ])
      stage.place(ctx.ui.button({ id: 'd-draw-open', label: 'Open drawer', variant: 'primary' }))
      stage.place(
        ctx.ui.drawer({
          id: 'd-draw-target',
          title: 'Slide over',
          description: 'This drawer shares dialog’s overlay contract — dismiss, overlay click, and Esc all close it.',
          placement: 'end',
        }),
      )
    }

    return { ok: true }
  },
})
