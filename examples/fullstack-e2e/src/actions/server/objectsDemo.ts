import { defineServerAction } from '@morgana/sdk'

/** Server code reaching an object: trusted (no access checks), fully typed. */
export const objectsDemo = defineServerAction({
  handler: async (ctx) => {
    const name = String(ctx.args.room ?? 'server-room')
    const op = String(ctx.args.op ?? 'basic')
    const room = await ctx.objects.chatRoom.getOrCreate(name, { title: 'Server room' })
    if (op === 'remind') return room.remindSoon({ ms: Number(ctx.args.ms ?? 300) })
    if (op === 'summarize') return room.summarizeLater()
    if (op === 'state') return room.state()
    if (op === 'close') {
      await room.close()
      return room.state()
    }
    // Server code may call what the browser may not (remindSoon has no access rule).
    const msg = await room.post({ text: 'from an action' })
    const chunks: string[] = []
    const stream = room.relay({ text: 'a b c d' })
    for await (const c of stream) chunks.push(String(c))
    const result = await stream.result
    const state = await room.state()
    const list = await ctx.objects.chatRoom.list()
    return { msg: msg.text, chunks: chunks.length, saved: Boolean(result.saved), count: state.count, label: state.label, listed: list.items.some((i) => i.name === name) }
  },
})
