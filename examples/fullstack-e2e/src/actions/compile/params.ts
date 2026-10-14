import { defineClientAction } from '@studiomorgana/sdk'
export const paramPages = defineClientAction({
  config: { on: 'compile' },
  handler: (ctx) => {
    const product = ctx.ui.pages.create({ name: 'product', address: 'products/:id' })
    product.app('main')
    product.place(ctx.ui.text({ id: 'product-t', content: 'PRODUCT TEMPLATE' }))
    const newp = ctx.ui.pages.create({ name: 'newproduct', address: 'products/new' })
    newp.app('main')
    newp.place(ctx.ui.text({ id: 'newp-t', content: 'NEW PRODUCT FORM' }))
    const order = ctx.ui.pages.create({ name: 'order', address: 'orders/:id', render: 'server', access: 'member', redirect: 'login' })
    order.app('main')
    order.place(ctx.ui.text({ id: 'order-t', content: 'placeholder' }))
    return { ok: true }
  },
})
