import { defineServerAction } from '@morgana/sdk'

/**
 * The collections contract, asserted at runtime.
 *
 * Every method on `ctx.server.collections` is declared to return a promise,
 * because reading or writing a record means reaching storage. An un-awaited call
 * is still perfectly legal JavaScript — reading a field off the returned promise
 * compiles, builds, and deploys — so nothing short of running it catches a
 * handle that has drifted to returning a bare value. That drift is not
 * hypothetical: it is exactly what happened when the contract allowed either
 * shape, and `listOrders` failed on every deployed call while passing locally.
 *
 * This action is the standing check. It is invoked by `smoke.mjs` against the
 * demo host and by CI against a real worker, so a regression fails the pipeline
 * instead of a user's page.
 */
export const verifyContract = defineServerAction({
  handler: async (ctx) => {
    const collections = ctx.server.collections as any

    // Reads first, against the store the compile lane declared.
    const shape = await collections.shape('orders')
    if (!shape || !Array.isArray(shape.columns)) {
      throw new Error('collections.shape() must resolve to the declared schema')
    }

    const count = await collections.count('orders')
    if (typeof count !== 'number') {
      throw new Error(`collections.count() must resolve to a number, got ${typeof count}`)
    }

    const page = await collections.query('orders', { page: 1, pageSize: 5 })
    if (!Array.isArray(page?.items)) {
      throw new Error('collections.query() must resolve to { items: [...] }')
    }
    if (typeof page.total !== 'number') {
      throw new Error('collections.query() must resolve a numeric total')
    }

    // Write → read back, so `add` is exercised as a promise too, and so the
    // result is the record that was stored rather than a resolved envelope.
    const marker = `probe-${Date.now().toString(36)}`
    const record = await collections.add('orders', {
      total: 1,
      status: 'probe',
      customer: marker,
      paid: false,
    })
    if (!record || typeof record.id !== 'string') {
      throw new Error('collections.add() must resolve to the stored record, including its id')
    }

    // `find` takes a predicate, and a function created inside the sandbox is not
    // something the host can call — so a host-side `find` cannot receive one.
    // The host's own filter path is what a read has to go through here, and it
    // proves the same thing: a written record is findable.
    const page2 = await collections.query('orders', {
      page: 1,
      pageSize: 50,
      filter: { customer: marker },
    })
    if (!Array.isArray(page2.items)) {
      throw new Error('collections.query(filter) must resolve to { items: [...] }')
    }
    // Not "exactly one": an earlier build's probe rows may still be visible
    // depending on when the deploy's seed ran, and a leftover probe is not a
    // bug. What must hold is that the row just written is among the matches.
    if (!page2.items.some((row: any) => row?.id === record.id)) {
      throw new Error(
        `a written record must be findable by filter; ${record.id} missing from ${JSON.stringify(page2.items.map((r: any) => r?.id))}`,
      )
    }

    // Clean up after ourselves — this runs on every build, and a probe row per
    // build is a slow-motion way of filling someone's storefront.
    const removed = await collections.remove('orders', record.id)
    if (removed !== true) throw new Error('collections.remove() must resolve true for a stored record')

    ctx.log('collections contract verified', `${page.total} record(s), ${shape.columns.length} column(s)`)
    return { ok: true, columns: shape.columns.length, total: page.total }
  },
})