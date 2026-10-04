import { defineClientAction } from '@morgana/sdk'

/**
 * Bench page — built to be measured.
 *
 * A static-heavy marketing page is the easy case; this one is deliberately
 * awkward so the numbers mean something:
 *   - 60 bound rows, so a state commit has something not to touch
 *   - bound above-the-fold content, so CLS is observable
 *   - an image and a chart, for LCP
 *   - a browser action on `loaded` that writes state, exercising the
 *     index/paint path against a real document
 */
const ROWS = 60

/** Built in a module-scope helper so the compile action stays self-contained. */
const FEEDBACK = [
  { name: 'Ada', score: 98 },
  { name: 'Grace', score: 97 },
  { name: 'Alan', score: 95 },
  { name: 'Barbara', score: 93 },
  { name: 'Katherine', score: 92 },
  { name: 'Margaret', score: 91 },
  { name: 'Dorothy', score: 90 },
  { name: 'Mary', score: 89 },
]

export const bench = defineClientAction({
  config: { on: 'compile' },
  handler: (ctx) => {
    const page = ctx.ui.pages.create({
      name: 'bench',
      address: '/bench',
      title: 'Bench',
      meta: 'Measurement page.',
    })
    page.app('main')

    // Bound counter above the fold — the CLS canary.
    const head = ctx.ui.box({ id: 'b-head' })
    head.make('panel-elevated')
    head.setProps({ layout: 'row', align: 'center', justify: 'between', pad: 4 })
    const h1 = ctx.ui.text({ id: 'b-h1', content: 'Bench', font: 'h1' })
    const status = ctx.ui.text({ id: 'b-status', content: '—' })
    status.bind('bench.status')
    head.place(h1)
    head.place(status)
    page.place(head)

    // The LCP candidate: a real image, above the fold.
    const shot = ctx.ui.image({
      id: 'b-shot',
      src: '/assets/dashboard.svg',
      alt: 'Dashboard',
      aspectRatio: '16/9',
      fit: 'cover',
      radius: 'lg',
    })
    shot.setProps({ width: 'fill' })
    page.place(shot)

    // 60 bound rows. Every row is a separate subscription, so a commit that
    // touches one row must not walk the other 59.
    const title = ctx.ui.text({ id: 'b-rows-title', content: 'Feedback', font: 'h2' })
    page.place(title)
    const feed = ctx.ui.list({ id: 'b-feed' })
    feed.setProps({ layout: 'column', gap: 1 })
    for (let i = 0; i < ROWS; i++) {
      const pick = FEEDBACK[i % FEEDBACK.length] as { name: string; score: number }
      const row = ctx.ui.box({ id: `b-row-${i}` })
      row.setProps({ layout: 'row', align: 'center', justify: 'between', pad: 2, gap: 2 })
      const label = ctx.ui.text({ id: `b-row-${i}-name`, content: `${pick.name} #${i}` })
      const score = ctx.ui.text({ id: `b-row-${i}-score`, content: String(pick.score) })
      // All ROWS scores are bound — one subscription each. A commit to a
      // single row must cost one record, not ROWS.
      score.bind(`bench.r${i}`)
      row.place(label)
      row.place(score)
      feed.place(row)
    }
    page.place(feed)

    // A bound table, to compare list cost against table cost.
    page.place(ctx.ui.text({ id: 'b-table-title', content: 'Scores', font: 'h2' }))
    const table = ctx.ui.table({
      id: 'b-table',
      columns: [
        { key: 'name', label: 'Name', sortable: true },
        { key: 'score', label: 'Score', sortable: true, align: 'right' },
      ],
      data: FEEDBACK,
      density: 'compact',
    })
    page.place(table)

    ctx.ui.state.set('bench.status', 'measuring')
    for (let i = 0; i < ROWS; i++) {
      const pick = FEEDBACK[i % FEEDBACK.length] as { name: string; score: number }
      ctx.ui.state.set(`bench.r${i}`, pick.score)
    }
    return { ok: true }
  },
})
