import { defineClientAction } from '@morgana/sdk'

export const roomLoad = defineClientAction({
  config: { on: 'loaded' },
  handler: async (ctx) => {
    if (!document.querySelector('[data-entity="room-events"]')) return
    const room = await ctx.objects.chatRoom.getOrCreate('lobby', { title: 'Lobby' })
    room.on('message', (m: { text: string }) => {
      const ev = ctx.ui.get('room-events')!
      ev.set('content', `${String(ev.get('content') ?? '')}[${m.text}]`)
    })
  },
})

export const roomBump = defineClientAction({
  config: { on: 'room-bump.clicked' },
  handler: async (ctx) => {
    await ctx.objects.chatRoom.get('lobby').bump()
  },
})

export const roomAsk = defineClientAction({
  config: { on: 'room-ask.clicked' },
  handler: async (ctx) => {
    const out = ctx.ui.get('room-answer')!
    out.set('content', '')
    const stream = ctx.objects.chatRoom.get('lobby').relay({ text: 'from the browser' })
    for await (const chunk of stream) out.set('content', String(out.get('content') ?? '') + String(chunk))
    await stream.result
    out.set('content', `${String(out.get('content'))}|done`)
  },
})
