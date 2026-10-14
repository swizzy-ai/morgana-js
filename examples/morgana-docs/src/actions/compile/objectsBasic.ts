import { defineClientAction } from '@morgana/sdk'
import { placeShell, placeView } from '../../nav'

/**
 * Basic objects — box, text, link, image, badge, alert. Each view is the real
 * object with knobs wired to its props (see client/knobsBasic) and an event
 * log underneath. A knob that does nothing visible is a framework gap, not a
 * docs bug — that is what this page is for.
 */
export const objectsBasic = defineClientAction({
  config: { on: 'compile' },
  handler: (ctx) => {
    const page = ctx.ui.pages.create({
      name: 'objects-basic',
      address: 'objects-basic',
      title: 'Basic objects — Morgana Docs',
      favicon: '/assets/favicon.svg',
    })
    page.app('main')
    const content = placeShell(ctx, page, 'basic', 'Basic objects', 'Box, text, link, image, badge, alert — live, with knobs.')

    // ── Box ──
    {
      const { stage } = placeView(ctx, content, 'box', 'Box', 'The surface everything stands on. Change the background, padding, radius.', [
        { id: 'd-box-bg', kind: 'select', label: 'bg', options: ['#FFFFFF', '#F5F3FF', '#3F1521', '#111827', 'red', 'blue'] },
        { id: 'd-box-pad', kind: 'select', label: 'pad', options: ['2', '4', '6', '8'] },
        { id: 'd-box-radius', kind: 'select', label: 'radius', options: ['sm', 'md', 'lg', 'full'] },
      ])
      const target = ctx.ui.box({ id: 'd-box-target' })
      target.setProps({ layout: 'col', gap: 2, pad: 4, bg: '#FFFFFF' })
      target.make('card')
      target.place(ctx.ui.text({ id: 'd-box-target-t', content: 'I am the box. Click me.', font: 'body-lg' }))
      stage.place(target)
    }

    // ── Text ──
    {
      const { stage } = placeView(ctx, content, 'text', 'Text', 'Every font token in the scale, plus live content and color.', [
        { id: 'd-text-content', kind: 'input', label: 'content', value: 'The quick brown fox' },
        {
          id: 'd-text-font',
          kind: 'select',
          label: 'font',
          options: ['display', 'h1', 'h2', 'h3', 'title', 'subtitle', 'body-lg', 'body', 'body-sm', 'caption', 'mono'],
          value: 'h2',
        },
        { id: 'd-text-color', kind: 'select', label: 'color', options: ['#111827', '#5B21B6', '#B91C1C', 'blue', 'green'] },
      ])
      stage.place(ctx.ui.text({ id: 'd-text-target', content: 'The quick brown fox', font: 'h2' }))
    }

    // ── Link ──
    {
      const { stage } = placeView(ctx, content, 'link', 'Link', 'Navigation object — href is the prop that matters.', [
        { id: 'd-link-href', kind: 'input', label: 'href', value: '/motion/' },
      ])
      const link = ctx.ui.link({ id: 'd-link-target', href: '/motion/' })
      link.place(ctx.ui.text({ id: 'd-link-target-t', content: 'Take me somewhere →', font: 'body-lg' }))
      stage.place(link)
    }

    // ── Image ──
    {
      const { stage } = placeView(ctx, content, 'image', 'Image', 'src, fit, and size. The second src 404s on purpose — watch the fallback.', [
        { id: 'd-image-src', kind: 'select', label: 'src', options: ['/assets/favicon.svg', '/assets/missing.png'] },
        { id: 'd-image-fit', kind: 'select', label: 'fit', options: ['cover', 'contain', 'fill', 'none'] },
        { id: 'd-image-width', kind: 'select', label: 'width', options: ['64px', '128px', '256px'] },
      ])
      stage.place(
        ctx.ui.image({ id: 'd-image-target', src: '/assets/favicon.svg', alt: 'Morgana mark', width: '128px', fallback: 'image unavailable' } as any),
      )
    }

    // ── Badge ──
    {
      const { stage } = placeView(ctx, content, 'badge', 'Badge', 'Labels and variants.', [
        { id: 'd-badge-label', kind: 'input', label: 'label', value: 'New' },
        {
          id: 'd-badge-variant',
          kind: 'select',
          label: 'variant',
          options: ['default', 'success', 'warning', 'danger', 'info', 'purple', 'outline', 'pill'],
        },
      ])
      stage.place(ctx.ui.badge({ id: 'd-badge-target', label: 'New', variant: 'info' }))
    }

    // ── Avatar ──
    {
      const { stage } = placeView(ctx, content, 'avatar', 'Avatar', 'Image with initials fallback and status dot. Break the src to watch the fallback.', [
        { id: 'd-avatar-name', kind: 'input', label: 'name', value: 'Ada Lovelace' },
        { id: 'd-avatar-src', kind: 'select', label: 'src', options: ['/assets/favicon.svg', '/assets/missing.png', ''], value: '/assets/favicon.svg' },
        { id: 'd-avatar-status', kind: 'select', label: 'status', options: ['none', 'online', 'away', 'busy'], value: 'none' },
      ])
      stage.place(ctx.ui.avatar({ id: 'd-avatar-target', name: 'Ada Lovelace', src: '/assets/favicon.svg' }))
    }

    // ── Alert ──
    {
      const { stage } = placeView(ctx, content, 'alert', 'Alert', 'Title, description, variant, dismissible.', [
        { id: 'd-alert-title', kind: 'input', label: 'title', value: 'Heads up' },
        { id: 'd-alert-variant', kind: 'select', label: 'variant', options: ['info', 'success', 'warning', 'danger'] },
        { id: 'd-alert-dismiss', kind: 'toggle', label: 'dismissible', value: 'true' },
      ])
      stage.place(
        ctx.ui.alert({
          id: 'd-alert-target',
          title: 'Heads up',
          description: 'This is what an alert looks like with a description.',
          variant: 'info',
          dismissible: true,
        }),
      )
    }

    // ── Separator ──
    {
      const { stage } = placeView(ctx, content, 'rule', 'Separator', 'Horizontal or vertical rule, three variants.', [
        { id: 'd-rule-orient', kind: 'select', label: 'orientation', options: ['horizontal', 'vertical'], value: 'horizontal' },
        { id: 'd-rule-variant', kind: 'select', label: 'variant', options: ['solid', 'dashed', 'dotted'], value: 'solid' },
      ])
      stage.place(ctx.ui.separator({ id: 'd-rule-target' }))
    }

    // ── Skeleton ──
    {
      const { stage } = placeView(ctx, content, 'skel', 'Skeleton', 'Loading placeholder. Toggle the shimmer, change the width.', [
        { id: 'd-skel-animate', kind: 'toggle', label: 'animate', value: 'true' },
        { id: 'd-skel-width', kind: 'select', label: 'width', options: ['120px', '240px', '100%'], value: '240px' },
      ])
      stage.place(ctx.ui.skeleton({ id: 'd-skel-target', width: '240px', height: 40 }))
    }

    // ── Breadcrumbs ──
    {
      const { stage } = placeView(ctx, content, 'crumbs', 'Breadcrumbs', 'Trail with separator. The separator knob rewrites every divider live.', [
        { id: 'd-crumbs-sep', kind: 'select', label: 'separator', options: ['/', '›', '→'], value: '/' },
      ])
      stage.place(
        ctx.ui.breadcrumbs({
          id: 'd-crumbs-target',
          separator: '/',
          items: [
            { label: 'Home', href: '/' },
            { label: 'Objects', href: '/objects-basic/' },
            { label: 'Basic' },
          ],
        }),
      )
    }

    // ── Video / Audio ──
    {
      const { stage } = placeView(ctx, content, 'media', 'Video & Audio', 'Native players with play/pause methods. No fixture media ships, so the players stand empty — the methods are what this view proves.', [])
      const row = ctx.ui.box({ id: 'd-media-btns' })
      row.setProps({ layout: 'row', gap: 2, wrap: true })
      row.place(ctx.ui.button({ id: 'd-media-vplay', label: 'Play video', variant: 'outline' }))
      row.place(ctx.ui.button({ id: 'd-media-vpause', label: 'Pause video', variant: 'outline' }))
      row.place(ctx.ui.button({ id: 'd-media-aplay', label: 'Play audio', variant: 'outline' }))
      row.place(ctx.ui.button({ id: 'd-media-apause', label: 'Pause audio', variant: 'outline' }))
      stage.place(row)
      stage.place(ctx.ui.video({ id: 'd-media-vtarget', controls: true }))
      stage.place(ctx.ui.audio({ id: 'd-media-atarget', controls: true }))
    }

    // ── Markdown / Code ──
    {
      const { stage } = placeView(ctx, content, 'prose', 'Markdown & Code', 'Compile-rendered prose. Static by design — content is baked at build, so these views showcase rather than tune.', [])
      stage.place(ctx.ui.markdown({ id: 'd-prose-md', content: '# Hello\n\nThis is **markdown**, rendered at compile time. Not literal text.' }))
      stage.place(ctx.ui.code({ id: 'd-prose-code', content: 'const x = make("card")', language: 'ts' }))
    }

    // ── Toast ──
    {
      const { stage } = placeView(ctx, content, 'toast', 'Toast', 'One region, stamped toasts. Notify per variant, overflow the cap, dismiss — the region proves it.', [
        { id: 'd-toast-duration', kind: 'input', label: 'duration ms', value: '4000' },
      ])
      const row = ctx.ui.box({ id: 'd-toast-btns' })
      row.setProps({ layout: 'row', gap: 2, wrap: true })
      for (const variant of ['info', 'success', 'warning', 'danger']) {
        row.place(ctx.ui.button({ id: `d-toast-${variant}`, label: variant, variant: 'outline' }))
      }
      row.place(ctx.ui.button({ id: 'd-toast-flood', label: 'Show 7 (caps at 5)', variant: 'primary' }))
      row.place(ctx.ui.button({ id: 'd-toast-clear', label: 'Clear', variant: 'outline' }))
      stage.place(row)
      stage.place(ctx.ui.toast({ id: 'd-toast-target', position: 'bottom-end' }))
    }

    // ── Blockquote / Kbd / Status / Spinner ──
    {
      const { stage } = placeView(ctx, content, 'quote', 'Quote, keys, status, spinner', 'Static display primitives with live status + spinner proofs.', [
        { id: 'd-quote-status', kind: 'select', label: 'status', options: ['info', 'success', 'warning', 'error', 'neutral'], value: 'success' },
      ])
      stage.place(ctx.ui.blockquote({ id: 'd-quote-target', content: 'The best way out is always through.', cite: 'Robert Frost' }))
      const kbdRow = ctx.ui.box({ id: 'd-quote-kbd-row' })
      kbdRow.setProps({ layout: 'row', gap: 1, align: 'center' })
      kbdRow.place(ctx.ui.kbd({ id: 'd-quote-kbd', keys: ['Ctrl', 'Shift', 'P'] }))
      kbdRow.place(ctx.ui.text({ id: 'd-quote-kbd-t', content: 'opens the palette', font: 'body' }))
      stage.place(kbdRow)
      const statRow = ctx.ui.box({ id: 'd-quote-stat-row' })
      statRow.setProps({ layout: 'row', gap: 3, align: 'center' })
      statRow.place(ctx.ui.status({ id: 'd-quote-status-t', label: 'Deploys', value: 'success' }))
      statRow.place(ctx.ui.spinner({ id: 'd-quote-spin', label: 'Syncing…' }))
      stage.place(statRow)
    }

    // ── Empty state / Aspect / Avatar group ──
    {
      const { stage } = placeView(ctx, content, 'misc', 'Empty, ratio, faces', 'Empty states, aspect boxes, and avatar stacks.', [])
      stage.place(
        ctx.ui.emptyState({
          id: 'd-misc-empty',
          title: 'No results',
          description: 'Try a different search, or create something new.',
        }),
      )
      const ar = ctx.ui.aspectRatio({ id: 'd-misc-ratio', ratio: '16/9' })
      ar.place(ctx.ui.text({ id: 'd-misc-ratio-t', content: '16 : 9', font: 'body-me' }))
      stage.place(ar)
      stage.place(
        ctx.ui.avatarGroup({
          id: 'd-misc-faces',
          max: 3,
          avatars: [{ name: 'Ada Lovelace' }, { name: 'Grace Hopper' }, { name: 'Katherine Johnson' }, { name: 'Margaret Hamilton' }],
        }),
      )
    }

    // ── Data list / Progress ring / Code block ──
    {
      const { stage } = placeView(ctx, content, 'facts', 'Facts, ring, snippet', 'Label/value rows, a progress ring with a live knob, and a copyable snippet.', [
        { id: 'd-facts-ring', kind: 'input', label: 'ring value', value: '65' },
      ])
      stage.place(
        ctx.ui.dataList({
          id: 'd-facts-target',
          items: [
            { label: 'Version', value: '0.1.0' },
            { label: 'Tests', value: '351 green' },
            { label: 'Objects', value: '50 typed' },
          ],
        }),
      )
      stage.place(ctx.ui.progressCircle({ id: 'd-facts-ring-t', value: 65, showLabel: true }))
      stage.place(ctx.ui.codeBlock({ id: 'd-facts-code', content: 'box.make("gradient:sunset")', language: 'ts' }))
    }

    return { ok: true }
  },
})
