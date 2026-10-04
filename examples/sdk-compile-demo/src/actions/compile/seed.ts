import { defineClientAction } from '@morgana/sdk'

export const seed = defineClientAction({
  config: { on: 'compile' },
  handler: (ctx) => {
    ctx.libraries.define('lucide', {
      cdnUrl: 'https://unpkg.com/lucide@latest',
      globalVar: 'lucide',
    })
    ctx.ui.icons.define('cart', { kind: 'library', library: 'lucide', name: 'shopping-cart' })
    ctx.ui.icons.define('star', { kind: 'glyph', glyph: '★' })

    const page = ctx.ui.pages.create({ name: 'home', address: '/' })
    page.app('main')

    const hero = ctx.ui.box({ id: 'hero' })
    hero.make('card')
    hero.setProps({ layout: 'column', pad: 6, gap: 3 })
    const title = ctx.ui.text({ id: 'title', content: 'Demo Shop', font: 'h2' })
    const cta = ctx.ui.button({ id: 'cta', label: 'Checkout', variant: 'primary', icon: 'cart', iconPosition: 'left' })
    const status = ctx.ui.text({ id: 'status', content: 'cart closed' })
    status.bind('cart.statusLabel')
    // Backend-fed readout: loadStats (on page load) fetches getStats and
    // publishes state.stats — this text repaints live when it arrives.
    const visitors = ctx.ui.text({ id: 'stats', content: '…' })
    visitors.bind('stats.visitors')

    hero.place(title)
    hero.place(cta)
    hero.place(status)
    hero.place(visitors)
    page.place(hero)

    ctx.ui.breakpoints.define('tablet', { minWidth: 640 })
    hero.setWithBreakpoint('tablet', { layout: 'row' })
    ctx.ui.state.set('cart.open', false)
    return { ok: true }
  },
})
