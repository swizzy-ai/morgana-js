import { defineClientAction } from '@morgana/sdk'

/** A page driven by a server object: bound state, a streamed answer, live events. */
export const roomPage = defineClientAction({
  config: { on: 'compile' },
  handler: (ctx) => {
    const page = ctx.ui.pages.create({ name: 'room', address: 'room' })
    page.app('main')
    const title = ctx.ui.text({ id: 'room-title', content: '…' })
    title.bind('object:chat-room/lobby.title')
    const label = ctx.ui.text({ id: 'room-label', content: '…' })
    label.bind('object:chat-room/lobby.label')
    page.place(title)
    page.place(label)
    page.place(ctx.ui.button({ id: 'room-bump', label: 'bump' }))
    page.place(ctx.ui.button({ id: 'room-ask', label: 'ask' }))
    page.place(ctx.ui.text({ id: 'room-answer', content: '' }))
    page.place(ctx.ui.text({ id: 'room-events', content: '' }))
    return { ok: true }
  },
})
