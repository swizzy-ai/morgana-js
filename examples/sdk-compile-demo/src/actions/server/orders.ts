import { defineServerAction } from '@morgana/sdk'

/**
 * Orders — the backend's real surface, and what the live list on the home
 * page reads. Every method is the `ctx.server.collections` contract; nothing
 * here is a demo stub.
 */
/**
 * Orders — the backend's real surface, and what the live list on the home
 * page reads. Every method is the `ctx.server.collections` contract; nothing
 * here is a demo stub.
 *
 * The `await`s are required by the contract, not stylistic. Every method on
 * `CollectionsHandle` returns a promise, so reading `.items` off an un-awaited
 * `query()` is reading a property of a promise — which compiles fine and then
 * throws `cannot read property 'length' of undefined` on every call.
 */
export const listOrders = defineServerAction({
  config: { on: 'http.get /orders' },
  handler: async (ctx) => {
    const status = (ctx.args as any)?.status
    const page = Number((ctx.args as any)?.page ?? 1)
    const result = await (ctx.server.collections as any).query('orders', {
      where: status ? [{ field: 'status', op: 'eq', value: status }] : undefined,
      sort: { field: 'total', dir: 'desc' },
      page,
      pageSize: 25,
    })
    ctx.log('listed', result.items.length, 'of', result.total)
    return result
  },
})

export const addOrder = defineServerAction({
  handler: async (ctx) => {
    const a = (ctx.args ?? {}) as Record<string, unknown>
    const total = Number(a.total ?? 0)
    if (!Number.isFinite(total) || total <= 0) {
      throw new Error('order total must be a positive number')
    }
    return (ctx.server.collections as any).add('orders', {
      total,
      status: String(a.status ?? 'new'),
      customer: String(a.customer ?? 'anonymous'),
      paid: Boolean(a.paid),
    })
  },
})

export const payOrder = defineServerAction({
  handler: async (ctx) => {
    const id = String((ctx.args as any)?.id ?? '')
    const updated = await (ctx.server.collections as any).update('orders', id, { status: 'paid', paid: true })
    if (!updated) throw new Error(`order "${id}" not found`)
    ctx.log('paid', id)
    return updated
  },
})
