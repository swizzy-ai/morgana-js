import { defineClientAction } from '@studiomorgana/sdk'
import { placeShell, NAV } from '../../nav'

/**
 * Docs home — the map of the whole product. Every section gets a card with
 * what it proves; the rail (placeShell) carries the actual links.
 */
export const home = defineClientAction({
  config: { on: 'compile' },
  handler: (ctx) => {
    ctx.apps.create('main', { displayName: 'Morgana Docs' })

    const page = ctx.ui.pages.create({
      name: 'home',
      address: '/',
      title: 'Morgana Docs — every object, live',
      favicon: '/assets/favicon.svg',
    })
    page.app('main')

    const content = placeShell(
      ctx,
      page,
      'home',
      'Morgana Docs',
      'Every object, every prop, every lane — rendered live, tunable from the UI, backed by its own backend.',
    )

    const hero = ctx.ui.box({ id: 'd-home-hero' })
    // Raw CSS gradients already pass straight through bg — the gradient
    // shelf (named + stock) will replace this literal when it lands.
    hero.setProps({ layout: 'col', gap: 2, pad: 6, bg: 'linear-gradient(135deg, #5B21B6 0%, #EC4899 100%)' })
    hero.make('card')
    const heroT = ctx.ui.text({ id: 'd-home-hero-t', content: 'See it move. Change it. Watch the backend answer.', font: 'display' })
    heroT.setProps({ color: '#FFFFFF' })
    hero.place(heroT)
    const heroP = ctx.ui.text({
      id: 'd-home-hero-p',
      content: 'Pick a section in the rail. Each view is the real object with knobs wired to its props and an event log underneath — plus motion, style, lanes, a live backend, and two chat panes on one channel.',
      font: 'body-lg',
    })
    heroP.setProps({ color: '#F5F3FF' })
    hero.place(heroP)
    content.place(hero)

    const cards = ctx.ui.box({ id: 'd-home-cards' })
    cards.setProps({ layout: 'row', gap: 3, wrap: true })
    for (const item of NAV.filter((n) => n.key !== 'home')) {
      const card = ctx.ui.box({ id: `d-home-card-${item.key}` })
      card.setProps({ layout: 'col', gap: 1, pad: 4, bg: '#FFFFFF' })
      card.make('card')
      card.place(ctx.ui.text({ id: `d-home-card-${item.key}-t`, content: item.label, font: 'h3' }))
      const link = ctx.ui.link({ id: `d-home-card-${item.key}-l`, href: item.href })
      link.place(ctx.ui.text({ id: `d-home-card-${item.key}-l-t`, content: 'Open →', font: 'body-me' }))
      card.place(link)
      cards.place(card)
    }
    content.place(cards)

    return { ok: true }
  },
})
