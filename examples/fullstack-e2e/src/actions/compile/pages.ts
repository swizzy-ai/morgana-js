import { defineClientAction } from '@morgana/sdk'
export const pages = defineClientAction({
  config: { on: 'compile' },
  handler: (ctx) => {
    ctx.apps.create('main', { displayName: 'A' })
    const home = ctx.ui.pages.create({ name: 'home', address: '/' })
    home.app('main')
    home.place(ctx.ui.text({ id: 'home-t', content: 'public home' }))
    home.place(ctx.ui.button({ id: 'signup-btn', label: 'Sign up' }))
    home.place(ctx.ui.text({ id: 'who', content: 'nobody' }))
    const login = ctx.ui.pages.create({ name: 'login', address: 'login' })
    login.app('main')
    login.place(ctx.ui.text({ id: 'login-t', content: 'login page' }))
    const dash = ctx.ui.pages.create({ name: 'dashboard', address: 'dashboard', access: 'member', redirect: 'login' })
    dash.app('main')
    dash.place(ctx.ui.text({ id: 'dash-t', content: 'SECRET DASHBOARD' }))
    const admin = ctx.ui.pages.create({ name: 'admin', address: 'admin', access: { role: 'admin' } })
    admin.app('main')
    admin.place(ctx.ui.text({ id: 'admin-t', content: 'ADMIN ONLY' }))
    return { ok: true }
  },
})
