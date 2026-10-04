import { defineClientAction } from '@morgana/sdk'

/**
 * Landing page — a full marketing page exercising placements, grids,
 * measures, images, fonts, icons and responsive breakpoints.
 */
export const landing = defineClientAction({
  config: { on: 'compile' },
  handler: (ctx) => {
    const page = ctx.ui.pages.create({
      name: 'landing',
      address: '/landing',
      title: 'Acme — Ship faster',
      meta: 'Acme helps teams ship faster with less overhead.',
      favicon: '/assets/favicon.svg',
      headCSS: "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');",
    })
    page.app('main')

    // Breakpoints + measures: mobile-first, tablet ≥640, desktop ≥1024.
    ctx.ui.breakpoints.define('tablet', { minWidth: 640 })
    ctx.ui.breakpoints.define('desktop', { minWidth: 1024 })
    ctx.ui.measure.define('content', 300) // 300 units = 1200px max content width

    ctx.ui.icons.define('check', { kind: 'glyph', glyph: '✓' })
    ctx.ui.icons.define('arrow', { kind: 'library', library: 'lucide', name: 'arrow-right' })
    ctx.ui.icons.define('bolt', { kind: 'library', library: 'lucide', name: 'zap' })

    // ── Header ──
    const header = ctx.ui.header({ id: 'l-header' })
    header.setProps({ layout: 'row', align: 'center', justify: 'between', pad: 4 })
    header.set({ style: 'position:sticky;top:0;z-index:40;background:var(--background)' })
    const logo = ctx.ui.text({ id: 'l-logo', content: 'Acme', font: 'h3' })
    header.place(logo)
    const nav = ctx.ui.nav({ id: 'l-nav' })
    nav.setProps({ layout: 'row', gap: 4 })
    for (const [id, label, href] of [
      ['l-nav-f', 'Features', '#features'],
      ['l-nav-p', 'Pricing', '#pricing'],
      ['l-nav-d', 'Docs', '#docs'],
    ] as Array<[string, string, string]>) {
      const link = ctx.ui.link({ id, href })
      const text = ctx.ui.text({ id: `${id}-t`, content: label })
      link.place(text)
      nav.place(link)
    }
    header.place(nav)
    const navCta = ctx.ui.button({ id: 'l-nav-cta', label: 'Get started', variant: 'primary', icon: 'arrow', iconPosition: 'right' })
    header.place(navCta)
    nav.setWithBreakpoint('tablet', { display: 'none' })
    page.place(header)

    // ── Hero: copy stack + visual — stacked on mobile, side-by-side ≥tablet ──
    const hero = ctx.ui.box({ id: 'l-hero' })
    hero.make('hero-gradient')
    hero.setProps({ layout: 'column', align: 'center', justify: 'center', pad: 10, gap: 6, radius: 'xl' })
    hero.set({ style: 'position:relative;overflow:hidden' })
    hero.setWithBreakpoint('tablet', { layout: 'row', align: 'center' })
    hero.setWithBreakpoint('desktop', { pad: 12, gap: 8 })

    const copy = ctx.ui.vstack({ id: 'l-copy' })
    copy.setProps({ spacing: 4, grow: 1 })
    const pill = ctx.ui.badge({ id: 'l-pill', label: 'v2.0 is live', variant: 'pill', icon: 'bolt' })
    copy.place(pill)
    const headline = ctx.ui.text({ id: 'l-headline', content: 'Ship faster with less overhead', font: 'display' })
    headline.set({ fontFamily: 'Inter, system-ui, sans-serif', color: '#FFFFFF' })
    copy.place(headline)
    const sub = ctx.ui.text({ id: 'l-sub', content: 'One workspace for code, docs and deploys.', font: 'body-lg' })
    sub.set({ color: 'rgba(255,255,255,0.8)' })
    copy.place(sub)
    const ctas = ctx.ui.hstack({ id: 'l-ctas' })
    ctas.setProps({ spacing: 3 })
    const primary = ctx.ui.button({ id: 'l-cta-1', label: 'Start free', variant: 'primary', icon: 'arrow', iconPosition: 'right' })
    const secondary = ctx.ui.button({ id: 'l-cta-2', label: 'Watch demo', variant: 'outline' })
    ctas.place(primary)
    ctas.place(secondary)
    copy.place(ctas)
    hero.place(copy)

    // Floating badge, free-placed over the hero.
    const floating = ctx.ui.badge({ id: 'l-floating', label: '99.99% uptime', variant: 'success' })
    hero.place(floating, { mode: 'free', at: [4, 4] })

    // Hero visual: full width stacked on mobile, half beside the copy ≥tablet.
    const shot = ctx.ui.image({ id: 'l-shot', src: '/assets/dashboard.svg', alt: 'Dashboard screenshot', aspectRatio: '16/9', fit: 'cover', radius: 'lg' })
    shot.setProps({ width: 'fill' })
    shot.setWithBreakpoint('tablet', { width: 'half' })
    hero.place(shot)

    page.place(hero)

    // ── Features grid: 1 col base, 2 tablet, 3 desktop ──
    const featuresTitle = ctx.ui.text({ id: 'l-feat-title', content: 'Everything you need', font: 'h2' })
    page.place(featuresTitle)
    const grid = ctx.ui.grid({ id: 'l-grid' })
    grid.setProps({ grid: { cols: 1 }, gap: 4 })
    grid.setWithBreakpoint('tablet', { grid: { cols: 2 } })
    grid.setWithBreakpoint('desktop', { grid: { cols: 3 } })
    const feats: Array<[string, string, string]> = [
      ['f1', 'Fast deploys', 'Push and go live in seconds.'],
      ['f2', 'Type-safe', 'End-to-end contracts, always.'],
      ['f3', 'Observable', 'Logs, traces and metrics built in.'],
    ]
    for (const [key, title, body] of feats) {
      const card = ctx.ui.card({ id: `l-card-${key}` })
      card.make('card')
      card.setProps({ pad: 4, gap: 2, radius: 'lg' })
      const icon = ctx.ui.badge({ id: `l-card-${key}-icon`, label: '✓', variant: 'primary' })
      card.place(icon)
      const heading = ctx.ui.text({ id: `l-card-${key}-t`, content: title, font: 'h3' })
      card.place(heading)
      const copy = ctx.ui.text({ id: `l-card-${key}-b`, content: body })
      card.place(copy)
      grid.place(card)
    }
    page.place(grid)

    // ── Pricing ──
    const priceTitle = ctx.ui.text({ id: 'l-price-title', content: 'Simple pricing', font: 'h2' })
    page.place(priceTitle)
    const plans = ctx.ui.box({ id: 'l-plans' })
    plans.setProps({ layout: 'column', gap: 4 })
    plans.setWithBreakpoint('tablet', { layout: 'row' })
    const tiers: Array<[string, string, string, string]> = [
      ['starter', 'Starter', '$0', 'For side projects.'],
      ['pro', 'Pro', '$20', 'For growing teams.'],
      ['scale', 'Scale', 'Custom', 'For enterprises.'],
    ]
    for (const [key, name, price, blurb] of tiers) {
      const plan = ctx.ui.box({ id: `l-plan-${key}` })
      plan.setProps({ pad: 6, gap: 2, radius: 'lg' })
      if (key === 'pro') plan.make('panel-elevated')
      else plan.make('card')
      const pname = ctx.ui.text({ id: `l-plan-${key}-n`, content: name, font: 'h3' })
      plan.place(pname)
      const pprice = ctx.ui.text({ id: `l-plan-${key}-p`, content: price, font: 'display' })
      plan.place(pprice)
      const pblurb = ctx.ui.text({ id: `l-plan-${key}-b`, content: blurb })
      plan.place(pblurb)
      const go = ctx.ui.button({ id: `l-plan-${key}-go`, label: 'Choose', variant: key === 'pro' ? 'primary' : 'outline', icon: 'check' })
      plan.place(go)
      plans.place(plan)
    }
    page.place(plans)

    // ── Footer ──
    const footer = ctx.ui.footer({ id: 'l-footer' })
    footer.setProps({ layout: 'row', justify: 'between', align: 'center', pad: 4 })
    const fine = ctx.ui.text({ id: 'l-fine', content: '© 2026 Acme Inc.', font: 'caption' })
    footer.place(fine)
    const footLinks = ctx.ui.box({ id: 'l-foot-links' })
    footLinks.setProps({ layout: 'row', gap: 3 })
    for (const [id, label] of [['l-f-tos', 'Terms'], ['l-f-priv', 'Privacy']] as Array<[string, string]>) {
      const link = ctx.ui.link({ id, href: '#' })
      link.place(ctx.ui.text({ id: `${id}-t`, content: label }))
      footLinks.place(link)
    }
    footer.place(footLinks)
    page.place(footer)

    ctx.ui.state.set('landing.ready', true)
    return { ok: true }
  },
})
