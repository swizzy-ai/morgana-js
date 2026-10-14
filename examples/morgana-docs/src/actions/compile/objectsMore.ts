import { defineClientAction } from '@morgana/sdk'
import { placeShell, placeView } from '../../nav'

/**
 * More components — date picker, radio group, pagination, collapsible,
 * carousel, colour picker, context menu, command palette. Each one's events
 * land in its own log (actions/client/moreLog.ts), so a click proves both the
 * state change and the event.
 */
export const objectsMore = defineClientAction({
  config: { on: 'compile' },
  handler: (ctx) => {
    const page = ctx.ui.pages.create({
      name: 'objects-more',
      address: 'objects-more',
      title: 'More components — Morgana Docs',
      favicon: '/assets/favicon.svg',
    })
    page.app('main')
    const content = placeShell(ctx, page, 'more', 'More components', 'Date picker, radio group, pagination, collapsible, carousel, colour picker, context menu, command palette.')

    placeView(ctx, content, 'm-date', 'Date picker', 'Click the field. Days before the min are disabled; Esc closes. Event: changed { value }.', [])
      .stage.place(ctx.ui.datePicker({ id: 'm-date-target', value: '2026-10-15', min: '2026-10-05', weekStart: 'monday' }))

    placeView(ctx, content, 'm-radio', 'Radio group', 'Native radios, one name. Event: changed { value }.', [])
      .stage.place(
        ctx.ui.radioGroup({
          id: 'm-radio-target',
          value: 'monthly',
          options: [
            { label: 'Monthly', value: 'monthly', description: 'Billed every month' },
            { label: 'Yearly', value: 'yearly', description: 'Two months free' },
            { label: 'Lifetime', value: 'lifetime', disabled: true },
          ],
        }),
      )

    placeView(ctx, content, 'm-pages', 'Pagination', '200 items, 10 per page. Event: changed { page }.', [])
      .stage.place(ctx.ui.pagination({ id: 'm-pages-target', total: 200, pageSize: 10, page: 1 }))

    {
      const { stage } = placeView(ctx, content, 'm-coll', 'Collapsible', 'Placed children live in the panel. Events: opened / closed.', [])
      const c = ctx.ui.collapsible({ id: 'm-coll-target', title: 'Shipping details' })
      c.place(ctx.ui.text({ id: 'm-coll-body', content: 'Ships in 2–3 working days. Free over $50.' }))
      stage.place(c)
    }

    placeView(ctx, content, 'm-car', 'Carousel', 'Arrows, dots, loop; autoplay pauses on hover. Event: changed { index }.', [])
      .stage.place(
        ctx.ui.carousel({
          id: 'm-car-target',
          height: 50,
          autoplay: 5000,
          bg: 'gradient:sunset',
          items: [
            { title: 'Fast', caption: 'Static pages, one runtime' },
            { title: 'Full stack', caption: 'Server actions in a sandbox' },
            { title: 'Styled by props', caption: 'Every object, every state' },
          ],
        }),
      )

    placeView(ctx, content, 'm-color', 'Colour picker', 'Native picker, hex field, swatches. Event: changed { value } on commit.', [])
      .stage.place(ctx.ui.colorPicker({ id: 'm-color-target', value: '#4f46e5', swatches: ['#4f46e5', '#16a34a', '#dc2626', '#f59e0b'] }))

    placeView(ctx, content, 'm-ctx', 'Context menu', 'Right-click the box. Events: opened, selected { value }, closed.', [])
      .stage.place(
        ctx.ui.contextMenu({
          id: 'm-ctx-target',
          content: 'Right-click anywhere in here',
          pad: 6,
          bg: 'muted',
          radius: 'lg',
          items: [
            { label: 'Copy', value: 'copy', shortcut: '⌘C' },
            { label: 'Rename', value: 'rename' },
            { separator: true },
            { label: 'Delete', value: 'delete', disabled: true },
          ],
        }),
      )

    {
      const { stage } = placeView(ctx, content, 'm-cmd', 'Command palette', 'Press Ctrl+K (⌘K), or the button. Type to filter, arrows + Enter to pick.', [])
      stage.place(ctx.ui.button({ id: 'm-cmd-open', label: 'Open palette', variant: 'outline' }))
      stage.place(
        ctx.ui.commandPalette({
          id: 'm-cmd-target',
          items: [
            { label: 'Go to home', value: 'nav:home', group: 'Navigate', shortcut: 'G H' },
            { label: 'Go to style lab', value: 'nav:style', group: 'Navigate' },
            { label: 'Toggle dark mode', value: 'theme:dark', group: 'Appearance' },
            { label: 'Use light mode', value: 'theme:light', group: 'Appearance' },
          ],
        }),
      )
    }
    return { ok: true }
  },
})
