import { defineClientAction } from '@morgana/sdk'

/**
 * Custom objects in use.
 *
 * `ctx.ui.videoPlayer(...)`, `ctx.ui.stripedTable(...)` and
 * `ctx.ui.threeScene(...)` are the same shape of call as `ctx.ui.box(...)`. The
 * components live in `src/objects/` and were picked up by the compiler with no
 * registration step and no manifest to edit.
 *
 * `video-player` is pure `define` — it composes real video/text/box objects, so it
 * ships no client JavaScript. `striped-table` sets `render: 'table'`, so it is a
 * single real table with every `TableHandle` method plus its own. `three-scene`
 * needs the browser, for a WebGL context it must release.
 */
export const components = defineClientAction({
  config: { on: 'compile' },
  handler: (ctx) => {
    const page = ctx.ui.pages.create({
      name: 'components',
      address: '/components',
      title: 'Custom objects',
    })

    // ── Composition: a player built from our own video + text + box ──────────
    const blurb = ctx.ui.text({
      id: 'c-blurb',
      content: 'Each of these is a component in src/objects/ — drop a file in and use it.',
      color: 'muted',
    })
    const player = ctx.ui.videoPlayer({
      id: 'c-player',
      src: '/assets/demo.svg',
      poster: '/assets/dashboard.svg',
      loop: true,
    })

    // ── Scoped-event targets ────────────────────────────────────────────────
    // The browser actions in src/actions/browser/scoped.ts bind to exactly
    // these ids, so `on: 'c-buy.clicked'` is a click on THIS button and not on
    // anything else on the page.
    const heading = ctx.ui.text({ id: 'c-heading', content: 'Custom objects', font: 'h1' })
    const buy = ctx.ui.button({ id: 'c-buy', label: 'Add to cart', variant: 'primary' })
    const card = ctx.ui.box({ id: 'c-card', surface: 'card', radius: 'lg', pad: 4, layout: 'column', gap: 2 })
    const badge = ctx.ui.badge({ id: 'c-cart-badge', label: 'Empty', variant: 'muted' })

    card.place(buy)
    card.place(badge)

    const stage = ctx.ui.box({ id: 'c-stage', layout: 'column', gap: 4, pad: 5, width: 720 })
    stage.place(heading)
    stage.place(blurb)
    stage.place(card)
    stage.place(player)

    // ── Derivative: genuinely a table, styled ───────────────────────────────
    const tableHeading = ctx.ui.text({ id: 'c-th', content: 'And one that IS a table', font: 'h2' })
    const orders = ctx.ui.stripedTable({
      id: 'c-orders',
      variant: 'striped',
      density: 'compact',
      columns: [
        { key: 'id', label: 'Order' },
        { key: 'total', label: 'Total', align: 'right' },
        { key: 'status', label: 'Status' },
      ],
      rows: [
        { id: 'A-100', total: '120.00', status: 'paid' },
        { id: 'A-101', total: '48.50', status: 'open' },
        { id: 'A-102', total: '310.00', status: 'paid' },
      ],
      selection: { mode: 'single' },
      pagination: { enabled: true, page: 1, pageSize: 2, showTotal: true },
    })

    const tableWrap = ctx.ui.box({ id: 'c-table-wrap', layout: 'column', gap: 2, pad: 5, width: 720 })
    tableWrap.place(tableHeading)
    tableWrap.place(orders)

    // ── Browser: a WebGL scene, which must release its context ──────────────
    const sceneHeading = ctx.ui.text({ id: 'c-sh', content: 'And one that needs the browser', font: 'h2' })
    const scene = ctx.ui.threeScene({
      id: 'c-scene',
      geometry: 'torusKnot',
      color: '#8b5cf6',
      autoRotate: true,
      speed: 2,
      height: 300,
    })
    // A component's own state lives in the page state under its id, so a
    // browser action can bind to it like any other value.
    const status = ctx.ui.text({ id: 'c-status', content: 'scene: not ready' })
    status.bind('c-scene.ready')

    const sceneWrap = ctx.ui.box({ id: 'c-scene-wrap', layout: 'column', gap: 2, pad: 5, width: 720 })
    sceneWrap.place(sceneHeading)
    sceneWrap.place(scene)
    sceneWrap.place(status)

    page.place(stage)
    page.place(tableWrap)
    page.place(sceneWrap)

    return { ok: true, components: ['video-player', 'striped-table', 'three-scene'] }
  },
})
