import { defineClientAction } from '@morgana/sdk'

/**
 * Kitchen sink — exercises the full object catalog on one page so every
 * template, style map and behavior can be verified in a browser.
 */
export const kitchen = defineClientAction({
  config: { on: 'compile' },
  handler: (ctx) => {
    const page = ctx.ui.pages.create({ name: 'kitchen', address: '/kitchen', title: 'Kitchen Sink' })
    page.app('main')

    const wrap = ctx.ui.box({ id: 'k-wrap' })
    wrap.setProps({ layout: 'column', pad: 6, gap: 4 })
    page.place(wrap)

    const title = ctx.ui.text({ id: 'k-title', content: 'Kitchen Sink', font: 'h1' })
    wrap.place(title)

    const buy = ctx.ui.button({ id: 'k-buy', label: 'Buy now', variant: 'primary', icon: 'cart' })
    wrap.place(buy)
    const ghost = ctx.ui.button({ id: 'k-ghost', label: 'Cancel', variant: 'ghost', disabled: true })
    wrap.place(ghost)

    const email = ctx.ui.input({
      id: 'k-email', type: 'email', placeholder: 'you@example.com',
      error: 'Enter a valid email', icon: 'star',
    })
    wrap.place(email)
    const bio = ctx.ui.textarea({ id: 'k-bio', placeholder: 'Tell us more', value: 'Hello' })
    wrap.place(bio)

    const pick = ctx.ui.select({
      id: 'k-pick', placeholder: 'Choose one', value: 'b',
      options: [
        { label: 'Alpha', value: 'a' },
        { label: 'Beta', value: 'b' },
        { label: 'Gamma', value: 'g', disabled: true },
      ],
    })
    wrap.place(pick)

    const table = ctx.ui.table({
      id: 'k-orders', caption: 'Orders', variant: 'striped', density: 'compact',
      columns: [
        { key: 'name', label: 'Name', sortable: true },
        { key: 'total', label: 'Total', sortable: true, align: 'right', format: 'currency' },
        { key: 'active', label: 'Active', format: 'boolean' },
      ],
      rows: [
        { name: 'bravo', total: 20, active: false },
        { name: 'alpha', total: 5, active: true },
        { name: 'charlie', total: 12, active: true },
      ],
      sorting: { key: 'total', direction: 'desc' },
      pagination: { page: 1, pageSize: 2, showTotal: true },
    })
    wrap.place(table)

    const tabs = ctx.ui.tabs({
      id: 'k-tabs', activeKey: 'ship',
      items: [
        { key: 'desc', label: 'Description', content: 'A fine product.' },
        { key: 'ship', label: 'Shipping', content: 'Ships in 24h.', badge: 2 },
        { key: 'faq', label: 'FAQ', disabled: true },
      ],
    })
    wrap.place(tabs)

    const dialog = ctx.ui.dialog({
      id: 'k-dialog', title: 'Confirm order', description: 'This cannot be undone.',
      confirmLabel: 'Place order', size: 'sm',
    })
    page.place(dialog)
    const openBtn = ctx.ui.button({ id: 'k-open-dialog', label: 'Open dialog', openDialog: 'k-dialog' })
    wrap.place(openBtn)

    const badge = ctx.ui.badge({ id: 'k-badge', label: 'Sale', variant: 'danger', removable: true, icon: 'star' })
    wrap.place(badge)
    const alertBox = ctx.ui.alert({
      id: 'k-alert', title: 'Heads up', description: 'Stock is low.',
      variant: 'warning', dismissible: true, actionLabel: 'Restock',
    })
    wrap.place(alertBox)

    const pic = ctx.ui.image({ id: 'k-pic', src: '/assets/demo.svg', alt: 'Demo', width: 320, fit: 'cover' })
    wrap.place(pic)
    const ext = ctx.ui.link({ id: 'k-ext', href: 'https://example.com', target: '_blank' })
    const extLabel = ctx.ui.text({ id: 'k-ext-label', content: 'External docs' })
    ext.place(extLabel)
    wrap.place(ext)

    const notify = ctx.ui.switch({ id: 'k-notify', label: 'Notify me', checked: true, size: 'lg' })
    wrap.place(notify)
    const agree = ctx.ui.checkbox({ id: 'k-agree', label: 'I agree', checked: false })
    wrap.place(agree)

    const row = ctx.ui.text({ id: 'k-row', content: '*name — $*total' })
    const feed = ctx.ui.list({ id: 'k-feed' })
    feed.addContent(row)
    feed.setProps({ data: [{ name: 'n1', total: 1 }, { name: 'n2', total: 2 }] })
    wrap.place(feed)

    const chart = ctx.ui.chart({ id: 'k-chart', kind: 'bar', series: [[3, 7, 5]], labels: ['a', 'b', 'c'] })
    wrap.place(chart)
    const pie = ctx.ui.chart({ id: 'k-pie', kind: 'donut', series: [[30, 70]] })
    wrap.place(pie)

    const bar = ctx.ui.progress({ id: 'k-bar', value: 30, max: 60, showLabel: true, striped: true, variant: 'sky' })
    wrap.place(bar)

    return { ok: true }
  },
})
