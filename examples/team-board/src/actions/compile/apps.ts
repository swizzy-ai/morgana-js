import { defineClientAction } from '@studiomorgana/sdk'

/**
 * Two apps in one project: the board everyone uses, and an admin app.
 * They share the server, the objects and auth, and deploy together.
 */
export const apps = defineClientAction({
  config: { on: 'compile' },
  handler: (ctx) => {
    ctx.apps.create('board', { displayName: 'Team Board' })
    ctx.apps.create('admin', { displayName: 'Team Board Admin' })

    const login = ctx.ui.pages.create({ name: 'login', address: 'login' })
    login.app('board')
    login.place(ctx.ui.login({ id: 'login-form' }))

    const admin = ctx.ui.pages.create({ name: 'admin', address: 'admin', access: { role: 'admin' }, redirect: 'login' })
    admin.app('admin')
    admin.place(ctx.ui.text({ id: 'admin-title', content: 'Admin', font: 'h2' }))
    const count = ctx.ui.text({ id: 'admin-count', content: '' })
    count.bind('object:board/main.label') // live: follows the board's state
    admin.place(count)

    return { ok: true }
  },
})
