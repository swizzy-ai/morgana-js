import { defineClientAction } from '@studiomorgana/sdk'

/**
 * The app and its login page. An app groups pages under one address and one
 * auth. `member` actions and objects need a signed-in visitor, and that sign-in
 * happens here.
 */
export const apps = defineClientAction({
  config: { on: 'compile' },
  handler: (ctx) => {
    ctx.apps.create('board', { displayName: 'Kanban' })

    const login = ctx.ui.pages.create({ name: 'login', address: 'login' })
    login.app('board')
    login.place(ctx.ui.login({ id: 'login-form' }))

    return { ok: true }
  },
})
