import { defineServerAction } from '@studiomorgana/sdk'

/** Every new message in any chat room: the instance is ctx.object. */
export const onRoomMessage = defineServerAction({
  config: { on: 'object:chat-room.messages.added' },
  handler: async (ctx) => {
    const event = (ctx.args as { event: { kind: string; payload: { id: string } } }).event
    if (event.kind !== 'object:chat-room.messages.added') throw new Error(`unexpected event ${event.kind}`)
    await ctx.object!.tally({ id: event.payload.id })
  },
})

/** Lifecycle: every room created gets welcomed. */
export const onRoomCreated = defineServerAction({
  config: { on: 'object:chat-room.created' },
  handler: async (ctx) => {
    await ctx.object!.welcome()
  },
})
