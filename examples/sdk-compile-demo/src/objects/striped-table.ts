/**
 * striped-table — a custom object that IS one of our objects.
 *
 * The `render` escape hatch. Setting it means the object is genuinely created as
 * a `table` node, so it is a single `<table>` rather than a wrapper around one,
 * and it keeps everything a table has: the renderer, the density and variant
 * styles, the sort/paginate/select behaviors, all 24 `TableHandle` methods, and
 * working `bind()`.
 *
 * `methods` are added, not swapped in — so this component has the whole table
 * surface plus its own.
 *
 * The trade is deliberate and worth stating: this couples the component to the
 * `table` built-in's contract. If that contract changes, this moves with it. That
 * is what you accept in exchange for "our table, styled" instead of "a box that
 * contains something table-shaped". Every other component avoids it entirely by
 * being a `box` and composing.
 */
import { createCustomObject } from '@morgana/sdk'

export default createCustomObject({
  name: 'striped-table',

  // This object IS a table. Not a box containing one.
  render: 'table',

  defaultProps: {
    variant: 'striped',
    density: 'compact',
    columns: [],
    rows: [],
  },

  state: { page: 1 },
  events: ['rowSelected'],

  methods: {
    /** Standard table methods still work — these sit alongside them. */
    firstPage(handle: any): void {
      handle.setPage(1)
      handle.state.set('page', 1)
    },
    lastPage(handle: any, total: number): void {
      const page = Math.max(1, total)
      handle.setPage(page)
      handle.state.set('page', page)
    },
    currentPage(handle: any): number {
      return Number(handle.state.get('page') ?? 1)
    },
  },
})
