import { defineClientAction } from '@morgana/sdk'
import { placeShell, placeView } from '../../nav'

/**
 * Themes & states — a project theme defined once and applied with make(),
 * colour modes, theme colour names in props, and hover/focus/active styles.
 * Everything here is props; no class or style strings.
 */
export const themesPage = defineClientAction({
  config: { on: 'compile' },
  handler: (ctx) => {
    ctx.ui.themes.define('indigo', {
      primary: '#4F46E5',
      primaryForeground: '#FFFFFF',
      accent: '#EEF2FF',
      accentForeground: '#3730A3',
      border: '#C7D2FE',
      dark: { background: '#0B0B1A', card: '#14142B', border: '#312E81', accent: '#1E1B4B', accentForeground: '#C7D2FE' },
    })

    const page = ctx.ui.pages.create({
      name: 'themes',
      address: 'themes',
      title: 'Themes & states — Morgana Docs',
      favicon: '/assets/favicon.svg',
    })
    page.app('main')
    const content = placeShell(ctx, page, 'themes', 'Themes & states', 'A theme is tokens; make() applies it to any subtree. States are props.')

    // ── A themed card, the same card as a dark island ──
    {
      const { stage } = placeView(ctx, content, 't-scope', 'Theme scopes', "make('theme:indigo') on the left; the same card with mode: 'dark' on the right.", [])
      const row = ctx.ui.box({ id: 't-row', layout: 'row', gap: 4, wrap: true })
      for (const [id, mode] of [['t-light', 'light'], ['t-dark', 'dark']] as const) {
        const card = ctx.ui.box({ id, layout: 'col', gap: 3, pad: 5, radius: 'lg', bg: 'card', border: true, minW: 64, mode })
        card.make('theme:indigo')
        card.place(ctx.ui.text({ id: `${id}-h`, content: mode === 'dark' ? 'Dark island' : 'Light', font: 'h3' }))
        card.place(ctx.ui.text({ id: `${id}-p`, content: 'Every colour below is a theme token.', color: 'muted-foreground' }))
        card.place(ctx.ui.button({ id: `${id}-b`, label: 'Primary action', bg: 'primary', color: 'primary-foreground' }))
        card.place(ctx.ui.badge({ id: `${id}-badge`, label: 'accent badge', bg: 'accent', color: 'accent-foreground' }))
        row.place(card)
      }
      stage.place(row)
    }

    // ── States as props ──
    {
      const { stage } = placeView(ctx, content, 't-states', 'Hover, focus, active', 'Each state takes the same props as the object. transition smooths them.', [])
      const row = ctx.ui.box({ id: 't-states-row', layout: 'row', gap: 3, wrap: true, align: 'center' })
      row.place(
        ctx.ui.button({
          id: 't-hover-btn',
          label: 'Hover me',
          bg: 'primary',
          color: 'primary-foreground',
          transition: 'fast',
          hover: { bg: '#4338CA', boxShadow: '0 6px 16px rgba(79,70,229,.35)' },
          active: { opacity: 0.8 },
          focus: { boxShadow: '0 0 0 3px #A5B4FC' },
        }),
      )
      row.place(ctx.ui.input({ id: 't-focus-in', placeholder: 'Focus me', transition: 'fast', focus: { borderColor: 'primary', boxShadow: '0 0 0 3px #C7D2FE' } }))
      const tile = ctx.ui.box({ id: 't-tile', pad: 4, radius: 'lg', border: true, bg: 'card', transition: 'normal', hover: { bg: 'accent', borderColor: 'primary' } })
      tile.place(ctx.ui.text({ id: 't-tile-t', content: 'Hover this card' }))
      row.place(tile)
      row.make('theme:indigo')
      stage.place(row)
    }

    // ── Page colour mode, live ──
    {
      const { stage } = placeView(ctx, content, 't-mode', 'Colour mode', 'ctx.ui.setTheme(mode) repaints the page: light, dark, or follow the OS.', [])
      const row = ctx.ui.box({ id: 't-mode-row', layout: 'row', gap: 2 })
      for (const mode of ['light', 'dark', 'system']) {
        row.place(ctx.ui.button({ id: `t-mode-${mode}`, label: mode, variant: 'outline' }))
      }
      stage.place(row)
    }
    return { ok: true }
  },
})
